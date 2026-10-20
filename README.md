# CowShell 2.0

A responsive personal progress dashboard built with plain HTML, CSS, and JavaScript.

## Run locally
1. Open this folder in VS Code.
2. Install the **Live Server** extension if you want automatic browser refresh.
3. Right-click `index.html` → **Open with Live Server**.
   - You can also open `index.html` directly in a browser, but Live Server is more convenient.

## Files
- `index.html` — page structure and dialogs
- `style.css` — responsive dark theme and layout
- `script.js` — missions, goals, skill milestones, activity heatmap, focus timer, achievements, and browser storage

## Data and backups
CowShell stores data in the browser's `localStorage` on the current device/browser. It does **not** sync between devices or browsers and clearing browser storage can remove it. Use **Settings & data → Export backup** to download a JSON backup. Importing a backup replaces the local data.

## Notes
- This is a static front-end starter; no login, server, or cloud sync is included.
- Activity uses local device calendar dates.
- Focus sessions are saved when the timer reaches zero.
- No real historical activity is invented. Empty heatmap squares mean no activity has been logged.
