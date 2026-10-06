# Air jumper

A responsive, browser-based flying game built with HTML, CSS, canvas, and the Web Audio API.

## Project structure

- `index.html` contains the flight hub, game interface, live challenge, flight journal, collectible guide, and bird shop.
- `styles.css` contains the responsive layout and visual styles for the game and its surrounding flight hub.
- `src/game.ts` coordinates game state, input, scoring, and the animation loop.
- `src/gameConfig.ts` contains the typed, immutable defaults for world dimensions, physics, pipes, pickups, power-ups, scoring, rendering, audio, and storage.
- `src/pipes.ts` owns pipe generation and bird/pipe collision checks.
- `src/pickups.ts` owns pickup spawning, collection, and off-screen lifecycle checks.
- `src/preferences.ts` loads and saves the best score and sound preference.
- `src/renderer.ts` owns canvas sizing, drawing, and particle effects; it caches static scenery and ground details, reuses particle objects, caps active rendering at 60 FPS, and lowers idle animation to 30 FPS.
- `src/worlds.ts` defines the four color-themed sky regions and their flight milestone rewards.
- `src/types.ts` contains shared game, pickup, rendering, and progression types.
- `src/audio.ts` handles generated music and sound effects.
- `src/progression.ts` saves coins, bird unlocks, and the selected bird.

## Gameplay

Tap or press Space to flap through the gates. A 3–2–1–GO countdown gives each flight a clear start. Collect coins, gems (worth five coins), and rare gold stars (worth ten coins) and use them to unlock five bird looks: Sunny, Bluebell, Berry, Minty, and Stardust. Pickups include a one-hit shield, coin magnet, double-coin boost, and slow-flight boost. Build a visible gate streak for bonus coins; some gates move vertically to keep later flights fresh. Fly far enough to visit the Sugar Cloud (10 gates), Twilight Ridge (25), and Aurora Sky (50); each region has its own scenery and grants a bonus once per flight. The flight hub shows your live streak challenge, best flight, wallet, selected bird, collectible values, and a shop shortcut.

Gates and their uncollected pickups enter from beyond the right edge. They remain tracked until every visible pickup has fully left the left edge, then are removed. Particle effects are also culled when they leave the play area. Static scenery and ground details are cached rather than redrawn every frame; rendering sleeps while the game is off-screen and caps at 60 FPS. The wider 7:8 canvas grows up to 900 CSS pixels on larger screens, while fitting narrow phones and compact landscape screens. Your coin balance, unlocked birds, selected bird, best score, and sound preference are saved in your browser.

## Run locally

Install the project dependencies with `npm install`, then start the Vite development server with `npm run dev`.

The game uses browser modules, so run it through a local web server rather than opening `index.html` directly as a file.

TypeScript is checked in strict mode during `npm run build`. Production source maps are disabled to keep the deployed build smaller.

## Tuning the game

Edit `GAME_CONFIG` in `src/gameConfig.ts` to adjust game balance and defaults. For example, `physics` controls gravity and flight speed, `pipes` controls gate spacing and gaps, `pickups` controls collectible routes and ranges, and `powerUps` controls boost durations. The object is read-only at runtime so systems share consistent settings.
