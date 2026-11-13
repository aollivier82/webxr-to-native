# Marble machine homepage (prototype)

A front-end prototype for Alix Ollivier's personal site (AI-enhanced creative strategist). The visitor gets one thing to do: push a marble.
The marble sets off a chain reaction down a four-step staircase, and each step flips open one
sign: Games, Writing, Videos, About. When the machine has finished, the camera pulls back so all
four signs are on screen without scrolling. The machine is a walnut staircase standing in an
apartment corner (plank floor, rug, window, lamp, plant). Each sign opens a popup page with a close
button; the popups are empty for now.

| Step | What happens | Sign |
|---|---|---|
| 1 | A plunger flicks the marble down a ramp into a line of dominoes; the last one squirts a ball into a pinball bumper | Games |
| 2 | The ball lands on a typewriter's lever, the typewriter types the label, and its carriage shoves the next ball off a tee | Writing |
| 3 | The ball rolls down a raised ramp onto a clapperboard and slams it shut; the film camera starts rolling | Videos |
| 4 | The ball circles a funnel, bounces down a xylophone and rolls into a jack-in-the-box | About |

## Run it

Open `index.html` in a browser, or serve the folder with any static server
(`npx serve personal-site`, GitHub Pages, Netlify, ...). There is no build step.
three.js r159 and two Google Fonts load from CDNs.

## Change it

- **Name and role**: the `<h1>` and `.role` paragraph in `index.html`.
- **Popup content**: the popup is one panel in `index.html` (`.sheet`), retitled for each sign by
  `setupSheets()` in `js/app.js`. Put each section's content in `.sheet-body`.
- **The four sections**: the links inside `<nav class="hits">` in `index.html`. The 3D signs are
  drawn from them, so changing the text changes the sign (the typewriter types whatever the
  second label says). Point each `href` at a real page, then remove the `preventDefault()` in the
  click handler in `js/app.js` so the links navigate.
- **Colours**: the custom properties at the top of `styles.css`. The 3D scene reads the same
  tokens, in both light and dark themes.
- **Pace**: `SPEED` at the top of `js/app.js` (1 is real time).
- **The machine itself**: `js/machine.js`. Each step is its own block. Every moving part is a
  function of time rather than live physics, so the run is identical on every device, can be
  skipped or replayed, and cannot get stuck.

## Files

- `index.html` - markup for the title block, the four links and the controls
- `styles.css` - design tokens (light and dark) and the overlay layout
- `js/core.js` - maths, textures, the rolling/falling motion engine, geometry helpers
- `js/machine.js` - the staircase, signs and the four stages
- `js/room.js` - the apartment around the machine
- `js/app.js` - renderer, lights, camera direction, controls, synthesised sound

## Behaviour worth knowing

- Sound is off until the visitor turns it on. All sounds are synthesised in the browser.
- "Skip" appears once the marble is moving; "Run it again" appears at the end.
- With `prefers-reduced-motion`, the page opens on the finished menu.
- Without WebGL, the four links show as a plain list.
- Keyboard: the first tab stop is a "Skip the machine" link; the signs are real links.
