-- =============================================================================
-- MYTHOS - Supabase (cloud) schema. Mirrors server/db/schema.sql, plus:
--   * profiles linked to auth.users (Supabase Auth replaces the local credentials table)
--   * Row Level Security on every table
--   * no client write access to game tables: rooms/matches/answers/scores are
--     written only by server-side code (Edge Functions using the service role)
-- Apply with:  supabase db push   (or paste into Dashboard -> SQL Editor)
-- =============================================================================

-- ----------------------------------------------------------------- tables
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text not null check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  avatar      text not null default 'ronin',
  is_guest    boolean not null default false,
  xp          integer not null default 0 check (xp >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index profiles_username_lower_key on public.profiles (lower(username));

create table public.rooms (
  id               uuid primary key default gen_random_uuid(),
  code             char(6) not null check (code ~ '^[A-Z0-9]{6}$'),
  name             text not null check (char_length(name) between 3 and 32),
  host_id          uuid not null references public.profiles(id),
  is_public        boolean not null default false,
  status           text not null default 'lobby' check (status in ('lobby','in_progress','finished','closed')),
  settings         jsonb not null,
  created_at       timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  closed_at        timestamptz
);
create unique index rooms_open_code_key on public.rooms (code) where closed_at is null;
create index rooms_public_browse_idx on public.rooms (is_public, status, last_activity_at desc) where closed_at is null;

create table public.room_players (
  room_id    uuid not null references public.rooms(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  left_at    timestamptz,
  last_seen_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index room_players_user_idx on public.room_players (user_id) where left_at is null;

create table public.questions (
  id             uuid primary key default gen_random_uuid(),
  category       text not null,
  difficulty     text not null check (difficulty in ('easy','medium','hard')),
  question       text not null unique,
  options        jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 4),
  correct_index  smallint not null check (correct_index between 0 and 3),
  explanation    text not null,
  tradition      text,
  valid_as_of    date,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);
create index questions_pick_idx on public.questions (category, difficulty) where active;

create table public.matches (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references public.rooms(id) on delete cascade,
  status        text not null default 'in_progress' check (status in ('in_progress','finished','abandoned')),
  settings      jsonb not null,
  player_count  integer not null default 0,
  winner_id     uuid references public.profiles(id),
  -- authoritative phase clock so any client / edge function can advance the match
  phase         text not null default 'countdown' check (phase in ('countdown','question','reveal','finished')),
  current_idx   smallint not null default -1,
  phase_ends_at timestamptz,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz
);
create index matches_room_idx on public.matches (room_id, started_at desc);

create table public.match_questions (
  match_id       uuid not null references public.matches(id) on delete cascade,
  idx            smallint not null check (idx >= 0),
  question_id    uuid not null references public.questions(id),
  option_order   smallint[] not null,
  correct_index  smallint not null check (correct_index between 0 and 3),
  opened_at      timestamptz,
  closes_at      timestamptz,
  closed_at      timestamptz,
  primary key (match_id, idx)
);

create table public.answers (
  id            bigint generated always as identity primary key,
  match_id      uuid not null,
  idx           smallint not null,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  choice        smallint not null check (choice between 0 and 3),
  is_correct    boolean not null,
  response_ms   integer not null check (response_ms >= 0),
  points        integer not null check (points >= 0),
  speed_bonus   integer not null default 0,
  streak_bonus  integer not null default 0,
  submitted_at  timestamptz not null default now(),
  foreign key (match_id, idx) references public.match_questions(match_id, idx) on delete cascade,
  unique (match_id, idx, user_id)          -- one answer per player per question
);
create index answers_user_idx on public.answers (user_id);

create table public.player_stats (
  user_id             uuid primary key references public.profiles(id) on delete cascade,
  matches_played      integer not null default 0,
  wins                integer not null default 0,
  losses              integer not null default 0,
  total_points        bigint not null default 0,
  questions_faced     integer not null default 0,
  questions_answered  integer not null default 0,
  correct_answers     integer not null default 0,
  current_win_streak  integer not null default 0,
  best_win_streak     integer not null default 0,
  highest_score       integer not null default 0,
  updated_at          timestamptz not null default now()
);
create index player_stats_points_idx on public.player_stats (total_points desc);

create table public.leaderboard_entries (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  match_id       uuid not null references public.matches(id) on delete cascade,
  room_name      text not null,
  points         integer not null,
  correct        integer not null,
  question_count integer not null,
  rank           integer not null,
  player_count   integer not null,
  won            boolean not null,
  xp_gained      integer not null,
  created_at     timestamptz not null default now(),
  unique (user_id, match_id)
);
create index leaderboard_entries_time_idx on public.leaderboard_entries (created_at desc);
create index leaderboard_entries_user_idx on public.leaderboard_entries (user_id, created_at desc);

-- ----------------------------------------------------------------- new user -> profile + stats
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  wanted text := coalesce(new.raw_user_meta_data->>'username', '');
  final_name text;
begin
  if wanted !~ '^[A-Za-z0-9_]{3,20}$' or exists (select 1 from profiles where lower(username) = lower(wanted)) then
    final_name := 'Warrior_' || substr(replace(new.id::text, '-', ''), 1, 8);
  else
    final_name := wanted;
  end if;
  insert into profiles (id, username, avatar, is_guest)
  values (new.id, final_name, coalesce(new.raw_user_meta_data->>'avatar', 'ronin'), coalesce(new.is_anonymous, false));
  insert into player_stats (user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------- helper for RLS
create or replace function public.is_room_member(r uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from room_players where room_id = r and user_id = auth.uid() and left_at is null);
$$;

-- ----------------------------------------------------------------- RLS
alter table public.profiles            enable row level security;
alter table public.rooms               enable row level security;
alter table public.room_players        enable row level security;
alter table public.questions           enable row level security;
alter table public.matches             enable row level security;
alter table public.match_questions     enable row level security;
alter table public.answers             enable row level security;
alter table public.player_stats        enable row level security;
alter table public.leaderboard_entries enable row level security;

-- Clients never write game tables directly; Edge Functions use the service role (bypasses RLS).
revoke insert, update, delete on all tables in schema public from anon, authenticated;
revoke all on public.questions, public.match_questions from anon, authenticated;

-- profiles: any signed-in player can see public profile info; you may edit only your own name/avatar
create policy "profiles readable by players" on public.profiles for select to authenticated using (true);
grant update (username, avatar) on public.profiles to authenticated;
create policy "edit own profile" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- rooms: public rooms are discoverable; private rooms only visible to members
create policy "browse public or member rooms" on public.rooms for select to authenticated
  using ((is_public and closed_at is null) or public.is_room_member(id));

create policy "see co-members" on public.room_players for select to authenticated
  using (public.is_room_member(room_id));

create policy "members see matches" on public.matches for select to authenticated
  using (public.is_room_member(room_id));

-- answers: a player can read their own answers only after the match is over
create policy "own answers after match" on public.answers for select to authenticated
  using (user_id = auth.uid() and exists (select 1 from public.matches m where m.id = match_id and m.status <> 'in_progress'));

create policy "stats are public" on public.player_stats for select to authenticated using (true);
create policy "leaderboards are public" on public.leaderboard_entries for select to authenticated using (true);

-- questions & match_questions: no policies => no client access at all (answers stay secret)

-- ----------------------------------------------------------------- realtime
-- Persistent state lives in tables; clients get change notifications (RLS applies)
alter publication supabase_realtime add table public.rooms, public.room_players, public.matches;
