# Quil

**Your next client. Already in sight.**

A conversational sales crew for freelancers and small agencies: discover relevant businesses, investigate their website situation, review evidence, and prepare a thoughtful introduction.

## Current implementation

This version is a **local frontend prototype**, built with React, TypeScript, Vite and Three.js:

- Brisk automatic rotation and a repeating 5.2-second cube/tree cycle, cursor-directed rotation and particle distortion, a star field, an unobstructed rippling floor and a reflection. No manual shape controls or orbital rings.
- An open landing-page layout with fine dividers, an animated SVG crew, and working internal footer navigation.
- A conversational app led by Quil, with Pip (scouting), Milo (research), Iris (review) and Wren (writing).
- Tiny original SVG characters walk between positions, exchange observations and react to the current example phase. No emoji, sprite-sheet download or generated image is used.
- Plain-language input and teammate introductions. Each timed example mission updates five colour-matched contributions in a connected layout, converging into one shared result rather than a long stream of status messages.
- Pause/resume, one primary opportunity, expandable reasons for the businesses set aside, inline evidence and editable drafts.
- Browser-local saved prospects, CSV export, clipboard copying and keyboard-accessible saved/about panels.

**All example businesses, sources and agent messages are fictional fixtures. No model inference, live business search or outreach occurs.** Mascot activity follows the local example state machine. It is not a live Mozaik execution trace.

**Development and review are local-only. Do not publish, push for hosting, or redeploy without the owner's explicit instruction.**

## Run

Use Node.js 22+ and npm:

```sh
npm install
npm run dev
```

Open the URL Vite prints. Select **Try now** to meet the crew. Use **Or try a little example**, or send a brief in the chat, to walk through the fictional example mission without spending API credits. Tap a character to hear their introduction. The square composer button pauses a mission; **Continue the example** resumes it.

```sh
npm run build
npm run preview
```

Production output is in `dist/`. Hash routing keeps `/#/workspace` compatible with static hosting.

## Planned live backend

The backend is **not implemented in this version**. Mozaik will coordinate Quil (lead), Pip (scout), Milo (business research), Iris (evidence review) and Wren (introductions). Research and website investigation run concurrently and publish evidence to shared state; new evidence can invalidate an earlier pitch and trigger targeted revision.

GPT-6 Luna is the selected model. Serper is the proposed discovery/search source. Neither has been connected or validated against the owner's account in this build.

Live implementation must keep keys server-side, verify model compatibility, record actual concurrent agent activity and sources, and reserve budget in a shared persistent ledger before each model request. Output, retries, run size and public usage must be bounded. Missing website fields must not be treated as proof of no website. Outreach requires user review.

Proposed allowances are $0.25 for integration testing and $0.50 total model usage, subject to final configuration. The frontend alone does not enforce an API spending limit.

**The hackathon requires Mozaik and at least two concurrent agents. This frontend alone does not meet those requirements.**

## Visual implementation

`src/components/ParticleScene.tsx` generates the scene in code, lazy-loads Three.js, limits pixel ratio and mobile particles, and pauses offscreen or when the document is hidden. It uses no video, image sequence, external 3D model or generated image. The feather SVG is original.

## Browser checks

Start the production preview on port 4173, then run:

```sh
node scripts/browser-qa.mjs
```

The script uses an installed Chrome browser through the DevTools Protocol; no browser is downloaded. Set `QUIL_QA_BROWSER` for another Chromium executable. It checks WebGL and automatic morphing, the removal of the old controls/cards, desktop/mobile overflow, crew introductions, typed prompts, mission pause/resume, example results, inline evidence/drafts, saving, opportunity filtering, saved state after a new conversation, composer visibility and mobile navigation. Runtime errors and compact JPEG screenshots go into ignored `.sites-runtime/qa/`.

## Credits

- [Three.js](https://threejs.org/) — MIT.
- [Departure Mono](https://departuremono.com/) by Helena Zhang — SIL Open Font License 1.1, included in `public/fonts/LICENSE.txt`.
- [SUSE Mono](https://github.com/SUSE/suse-font) — locally hosted variable font for navigation and supporting text; SIL Open Font License 1.1, included in `public/fonts/SUSE-Mono-OFL.txt`.
- React and Vite are retained from the supplied starter.

Quil's original code is MIT licensed; third-party assets retain their licenses.
