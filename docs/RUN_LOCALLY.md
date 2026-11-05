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

On the first run the server creates a `.data` folder and loads the 109 seed questions.
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
| `npm run check` | Lint, typecheck, tests and build in one go |

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

**Added new questions to `seed/questions.json`.** Restart the server. New questions are
added on startup without wiping existing data.
