# Running MYTHOS locally

Step-by-step guide to run the game on your own computer, play with friends on the same
Wi-Fi, and test multiplayer on your own. No accounts or cloud services are needed.

## Requirements

- **Node.js 18.18 or newer** (tested on Node 24) and npm, which comes with it.
  Check with `node -v` and `npm -v`.
- The project folder, for example
  `C:\Users\akshitk\OneDrive - AMDOCS\Desktop\mythos`.

## 1. Run the game on your computer

1. Open PowerShell and go to the project folder:

   ```powershell
   cd "C:\Users\akshitk\OneDrive - AMDOCS\Desktop\mythos"
   ```

2. Install dependencies. Only needed the first time, or after pulling new changes:

   ```powershell
   npm install
   ```

3. Start the game:

   ```powershell
   npm run dev
   ```

   This starts two things together:
   - the game server on `http://localhost:3001`
   - the website on `http://localhost:5173`

4. Open the `Local:` address the terminal prints, usually **http://localhost:5173**.
   If that port is busy, it uses the next free one (5174, 5175, ...).

5. Keep the PowerShell window open while you play. Press **Ctrl+C** in it to stop the game.

On the first run the server creates a `.data` folder and loads the question bank (1,265 questions).
Accounts, stats and match history are saved there and survive restarts.

## 2. Play with friends on the same Wi-Fi

1. Stop `npm run dev` if it is running (Ctrl+C).
2. In the project folder run:

   ```powershell
   npm start
   ```

   This builds the website and serves the game and website together on port 3001.

3. The terminal prints addresses such as `http://192.168.1.38:3001`. Share that address
   with friends on the same network; they open it in their browser.
4. If Windows Firewall asks, allow Node.js on **private** networks.

`npm run serve` does the same as `npm start` but skips the build step. Use it when you
have already built and haven't changed any code.

## 3. Test multiplayer on your own

1. Start the game (step 1 or 2) and create a room in the browser.
2. Note the 6-character room code shown in the lobby.
3. In a **second** PowerShell window, in the project folder, run:

   ```powershell
   npm run bots -- ROOMCODE 3
   ```

   Replace `ROOMCODE` with your code. This adds 3 bot players that join and answer
   randomly. Bots are real separate clients with no access to the correct answers.

You can also open the game in a second browser profile or a private window and sign in as
a different player.

## 4. Useful commands

| Command | What it does |
|---|---|
| `npm install` | Install dependencies |
| `npm run dev` | Run game server and website for development |
| `npm start` | Build, then serve everything on port 3001 (LAN play) |
| `npm run serve` | Serve the existing build without rebuilding |
| `npm run bots -- ROOMCODE 3` | Add 3 bot players to a room |
| `npm test` | Run the automated tests |
| `npm run check` | Lint, typecheck, question bank check, tests and build in one go |
| `npm run questions:check` | Validate the question bank |
| `npm run questions:generate` | Rebuild generated questions |
| `npm run questions:import -- --csv FILE --out seed/imported/NAME.json` | Import questions (see section 6) |

## 5. Troubleshooting

**`EADDRINUSE` / port 3001 already in use.** Another copy of the game is still running.
Close the other terminal, or find and stop it:

```powershell
Get-NetTCPConnection -LocalPort 3001 -State Listen | Select-Object OwningProcess
Stop-Process -Id <OwningProcess>
```

To use a different port instead: `$env:PORT=3002; npm run serve`.

**Website opens on 5174 instead of 5173.** Port 5173 was busy, which is harmless. Use the
address the terminal prints.

**Friends can't connect on Wi-Fi.** Make sure everyone is on the same network, you used
`npm start` (not `npm run dev`), and Windows Firewall allows Node.js on private networks.
Some office and public networks block device-to-device traffic.

**A battle stopped after restarting the server.** Live matches run in server memory, so a
restart ends them. Unfinished matches are closed cleanly on startup; start a new room.

**Start fresh (delete all accounts, stats and history).** Stop the game, delete the `.data`
folder, then start again. The questions are reloaded automatically.

**Added or edited questions but the game doesn't show them.** Restart the server. It reseeds
only when a seed file has changed; look for `question bank loaded: ... new` in the server log.
If the server refuses to start with `Seed question bank has N problem(s)`, run
`npm run questions:check` to see which file and question is wrong.

## 6. Adding questions

All questions live in the `seed` folder. On start the server loads every `.json` file in
`seed/questions`, `seed/generated` and `seed/imported`. New questions are added and edited ones
are updated, without touching accounts or match history. After any change:

```powershell
npm run questions:check   # validates every file and shows counts per category and difficulty
```

Then restart the server (`npm run dev` restarts automatically when server code changes, but not
when only seed files change, so press Ctrl+C and start it again).

### Write questions by hand

Open the category file in `seed/questions`, for example `seed/questions/anime.json`, and add one
line per question:

```json
{"c":"anime","d":"medium","q":"In Naruto, what is the name of the village Naruto comes from?","a":"Hidden Leaf Village","w":["Hidden Sand Village","Hidden Mist Village","Hidden Cloud Village"],"e":"Naruto Uzumaki is a ninja of Konohagakure, the Hidden Leaf Village.","t":null}
```

| Field | Meaning |
|---|---|
| `c` | Category id: `indian_mythology`, `world_mythology`, `general_knowledge`, `science`, `technology`, `history`, `geography`, `sports`, `movies`, `anime`, `literature`, `politics`, `mathematics` |
| `d` | `easy`, `medium` or `hard` |
| `q` | Question text (at least 10 characters, must not duplicate another question) |
| `a` | Correct answer |
| `w` | Exactly three wrong answers, all different from each other and from `a` |
| `e` | Explanation shown after the round |
| `t` | Tradition for mythology, for example `"Hindu (Ramayana)"` or `"Norse"`; otherwise `null` |
| `asOf` | Date the fact was checked, `"YYYY-MM-DD"`. Required for `politics` |
| `src` | Optional credit line if the question is not your own |

Don't worry about answer positions: the game shuffles the options.

### Generate questions from data

Geography, science and maths questions are built by a script, so their answers are correct by
construction:

- Countries (capital, continent, currency) are listed in `seed/data/countries.json`.
- Chemical elements are listed in `seed/data/elements.json`.
- Maths questions are computed from templates in `scripts/lib/generators.ts`.

To add a country or change a template, edit those files and run:

```powershell
npm run questions:generate
npm run questions:check
```

This rewrites `seed/generated/*.json`. Don't edit those files by hand; your changes would be
overwritten. If a generated question has the same text as a hand-written one, the hand-written
one is kept.

### Import a CSV question pack

Make a spreadsheet with this header row and save it as CSV (UTF-8):

```
category,difficulty,question,answer,wrong1,wrong2,wrong3,explanation,tradition,asOf
```

`category` can be the id (`world_mythology`) or the label (`World Mythology`). `tradition` and
`asOf` may be left empty, except `asOf` for politics. Then run:

```powershell
npm run questions:import -- --csv my-pack.csv --out seed/imported/my-pack.json
```

Add `--src "Your credit line"` if the questions come from someone else. Rows that fail
validation, or duplicate a question already in the bank, are listed with their row number and
reason; the rest are imported. Running the same command again replaces that output file.

### Import from Open Trivia DB

1. Open [opentdb.com/api_config.php](https://opentdb.com/api_config.php), choose a category,
   difficulty and **Multiple Choice**, leave encoding as **Default Encoding**, and click
   **Generate API URL**.
2. Open the URL in your browser and save the page as `opentdb.json`.
3. Run:

   ```powershell
   npm run questions:import -- --opentdb opentdb.json --out seed/imported/opentdb.json
   ```

True/false questions and categories MYTHOS doesn't have (for example Art or Vehicles) are skipped.
Open Trivia DB questions are licensed under CC BY-SA 4.0: each one is saved with its source, and the
licence and credit are listed in the README. Its questions have no explanations, so they show
"The correct answer is ... Source: Open Trivia DB." Imported politics questions are dated with the
import day. Review them before release, because current affairs go out of date.
