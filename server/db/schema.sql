-- MYTHOS local database schema (PostgreSQL 16 via PGlite).
-- Mirrors supabase/migrations so the same data model moves to the cloud later.
-- Idempotent: safe to run on every boot.

create table if not exists profiles (
  id            uuid primary key default gen_random_uuid(),
  username      text not null check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  avatar        text not null default 'ronin',
  is_guest      boolean not null default false,
  xp            integer not null default 0 check (xp >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists profiles_username_lower_key on profiles (lower(username));

-- Local-only: in the Supabase build, credentials live in auth.users.
create table if not exists credentials (
  user_id       uuid primary key references profiles(id) on delete cascade,
  password_hash text not null,
  created_at    timestamptz not null default now()
);

create table if not exists rooms (
  id               uuid primary key default gen_random_uuid(),
  code             char(6) not null check (code ~ '^[A-Z0-9]{6}$'),
  name             text not null check (char_length(name) between 3 and 32),
  host_id          uuid not null references profiles(id),
  is_public        boolean not null default false,
  status           text not null default 'lobby' check (status in ('lobby','in_progress','finished','closed')),
  settings         jsonb not null,
  created_at       timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  closed_at        timestamptz
);
create unique index if not exists rooms_open_code_key on rooms (code) where closed_at is null;
create index if not exists rooms_public_browse_idx on rooms (is_public, status, last_activity_at desc) where closed_at is null;

create table if not exists room_players (
  room_id    uuid not null references rooms(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  left_at    timestamptz,
  primary key (room_id, user_id)
);
create index if not exists room_players_user_idx on room_players (user_id) where left_at is null;

create table if not exists questions (
  id             uuid primary key default gen_random_uuid(),
  category       text not null,
  difficulty     text not null check (difficulty in ('easy','medium','hard')),
  question       text not null,
  options        jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 4),
  correct_index  smallint not null check (correct_index between 0 and 3),
  explanation    text not null,
  tradition      text,
  valid_as_of    date,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (question)
);
create index if not exists questions_pick_idx on questions (category, difficulty) where active;

create table if not exists matches (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references rooms(id) on delete cascade,
  status        text not null default 'in_progress' check (status in ('in_progress','finished','abandoned')),
  settings      jsonb not null,
  player_count  integer not null default 0,
  winner_id     uuid references profiles(id),
  started_at    timestamptz not null default now(),
  finished_at   timestamptz
);
create index if not exists matches_room_idx on matches (room_id, started_at desc);

create table if not exists match_questions (
  match_id       uuid not null references matches(id) on delete cascade,
  idx            smallint not null check (idx >= 0),
  question_id    uuid not null references questions(id),
  option_order   smallint[] not null,
  correct_index  smallint not null check (correct_index between 0 and 3),
  opened_at      timestamptz,
  closes_at      timestamptz,
  closed_at      timestamptz,
  primary key (match_id, idx)
);

create table if not exists answers (
  id            bigint generated always as identity primary key,
  match_id      uuid not null,
  idx           smallint not null,
  user_id       uuid not null references profiles(id) on delete cascade,
  choice        smallint not null check (choice between 0 and 3),
  is_correct    boolean not null,
  response_ms   integer not null check (response_ms >= 0),
  points        integer not null check (points >= 0),
  speed_bonus   integer not null default 0,
  streak_bonus  integer not null default 0,
  submitted_at  timestamptz not null default now(),
  foreign key (match_id, idx) references match_questions(match_id, idx) on delete cascade,
  unique (match_id, idx, user_id)
);
create index if not exists answers_user_idx on answers (user_id);

create table if not exists player_stats (
  user_id             uuid primary key references profiles(id) on delete cascade,
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
create index if not exists player_stats_points_idx on player_stats (total_points desc);

create table if not exists leaderboard_entries (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references profiles(id) on delete cascade,
  match_id      uuid not null references matches(id) on delete cascade,
  room_name     text not null,
  points        integer not null,
  correct       integer not null,
  question_count integer not null,
  rank          integer not null,
  player_count  integer not null,
  won           boolean not null,
  xp_gained     integer not null,
  created_at    timestamptz not null default now(),
  unique (user_id, match_id)
);
create index if not exists leaderboard_entries_time_idx on leaderboard_entries (created_at desc);
create index if not exists leaderboard_entries_user_idx on leaderboard_entries (user_id, created_at desc);
