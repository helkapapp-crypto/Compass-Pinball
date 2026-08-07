# Compass AI & Tech Pinball

A browser-based pinball game built with vanilla JavaScript and the HTML5 Canvas API. Players launch a ball into a physics-driven playfield, rack up points off bumpers and flippers, and unlock discount coupons at score milestones. Scores are submitted to a Google Sheets-backed leaderboard.

## Features

- Physics-based ball, flipper, and bumper simulation on `<canvas>`
- Charge-and-launch mechanic (hold the Launch button or Space bar)
- Keyboard (Arrow keys / A-D) and on-screen controls for flippers
- Score milestones (1500–5000 pts) that award discount coupon codes via a pop-up
- "Game Over" pop-up after all 3 balls are lost, with a one-click restart
- Player entry form (name + email) gating the start of a session
- Online leaderboard (top 10) backed by a Google Apps Script endpoint
- Best score persisted locally via `localStorage`

## Project structure

```
pinball/
├── index.html   # Page markup: canvas, HUD, and all modals (entry, milestone, game over, leaderboard)
├── styles.css   # Layout and visual styling
└── app.js       # Game state, physics loop, rendering, and backend integration
```

There is no build step or package manager involved — the game is plain HTML/CSS/JS.

## Getting started

Because the game is a static site, any local web server works. Opening `index.html` directly by double-clicking usually works too, but serving it avoids browser restrictions around `fetch` on the `file://` protocol.

With live reload (via [live-server](https://www.npmjs.com/package/live-server)), recommended for development:

```bash
npm install
npm start
```

This opens `http://localhost:8080` and refreshes the page automatically whenever you edit `index.html`, `styles.css`, or `app.js`. If you use VS Code, the [Live Server extension](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) works the same way with no setup — right-click `index.html` and choose "Open with Live Server".

Without Node, any static file server works too:

```bash
python -m http.server 8080
# or
npx serve .
```

Then open `http://localhost:8080` in your browser.

## How to play

1. Enter a name and email on the welcome screen to start a session.
2. Hold the **Launch** button (or **Space**) to charge the plunger, then release to fire the ball.
3. Use **← / →** or **A / D** (or the on-screen controls) to trigger the left/right flippers.
4. Hit bumpers to score points. Reaching a score milestone shows a coupon code pop-up.
5. You have 3 balls per game. When all are lost, a **Game Over** pop-up shows your final score with an option to play again.

## Backend integration

`app.js` posts to a Google Apps Script Web App for two things:

| Constant          | Purpose                                              |
|--------------------|-------------------------------------------------------|
| `REGISTER_URL`      | Registers a new player and reports score updates      |
| `LEADERBOARD_URL`   | Fetches the top scores shown in the Leaderboard modal |

To point the game at your own backend, update these constants near the top of [app.js](app.js) with your deployed Apps Script Web App URL(s).

## License

No license file is currently included. Add one (e.g. MIT) before distributing or open-sourcing this project if that's the intent.
