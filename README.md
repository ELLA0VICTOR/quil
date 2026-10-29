# Quil

**Your next client. Already in sight.**

A sales workspace for freelancers and small agencies: discover relevant businesses, investigate their website situation, review evidence, and prepare a thoughtful introduction.

## Current implementation

This version is a **frontend prototype**, built with React, TypeScript, Vite and Three.js:

- Live WebGL particles morph between a rotating cube and a branching tree.
- Pointer distortion, a star field, orbital rings, a rippling floor and a reflection.
- Shape selection, pause, reduced-motion support and a WebGL fallback.
- Responsive landing page and workspace with glass panels and pixel typography.
- Example research workflow, filtering, evidence viewer and editable introductions.
- Browser-local saved prospects, CSV export, clipboard copying and keyboard-accessible dialogs.

**All example businesses, sources and agent events are fictional fixtures. No API request, model inference or outreach occurs.** The example timeline is not a live Mozaik trace.

## Run

Use Node.js 22+ and npm:

```sh
npm install
npm run dev
```

Open the URL Vite prints. Select **Try now**, then **Explore an example** to walk through the interface without spending API credits.

```sh
npm run build
npm run preview
```

Production output is in `dist/`. Hash routing keeps `/#/workspace` compatible with static hosting.

## Planned live backend

The backend is **not implemented in this version**. Mozaik will coordinate the Scout, Business Researcher, Website Analyst, Reviewer and Introduction Writer. Research and website investigation run concurrently and publish evidence to shared state; new evidence can invalidate an earlier pitch and trigger targeted revision.

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

The script uses an installed Chrome browser through the DevTools Protocol; no browser is downloaded. Set `QUIL_QA_BROWSER` for another Chromium executable. It checks WebGL, desktop/mobile overflow, navigation, example results, evidence/draft dialogs, saving, connections and mobile navigation. Runtime errors and compact JPEG screenshots go into ignored `.sites-runtime/qa/`.

## Credits

- [Three.js](https://threejs.org/) — MIT.
- [Departure Mono](https://departuremono.com/) by Helena Zhang — SIL Open Font License 1.1, included in `public/fonts/LICENSE.txt`.
- React and Vite are retained from the supplied starter.

Quil's original code is MIT licensed; third-party assets retain their licenses.
