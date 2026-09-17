# YACE — modular source + esbuild pipeline

This is the original `content.js` (4,393 lines, single IIFE, ~90 functions)
split into 25 ES modules under `src/content/`, plus the untouched
`background.js`, `manifest.json` (updated to load `dist/content.js`), and
`sidebar.css`.

The split was generated mechanically from the original file: every top-level
function was extracted with its original body untouched except for one
change — references to the old closure-scoped `let` variables (`currentTab`,
`cachedCourseMap`, `whatIfScores`, etc.) were rewritten to `state.<name>`,
where `state` is the shared mutable store in `src/content/state.js` (see
comment at the top of that file for why a plain object is used instead of
`let` exports). Every generated file has been syntax-checked with
`node --check`, and every `import { ... } from '...'` has been verified
against the real `export` statements in its target file.

## Build

```bash
npm install
npm run build     # one-shot, minified, no sourcemap -> dist/content.js
npm run watch      # rebuilds on save, inline sourcemap, for `about:debugging`
```

`dist/` is not checked in here — run `npm run build` (or `npm run watch`)
once before loading the extension.

## Loading in Firefox for development

1. `npm install && npm run watch` (leave this running in a terminal)
2. `about:debugging#/runtime/this-firefox` → "Load Temporary Add-on…" → select
   this folder's `manifest.json`
3. After each source edit, esbuild rewrites `dist/content.js` automatically
   (watch mode) — but Firefox does **not** auto-reload temporary extensions,
   so click "Reload" on the extension card in `about:debugging` to pick up
   the new bundle.
4. Before packaging for AMO, run `npm run build` (prod mode) instead — it
   strips the inline sourcemap and minifies.

## Directory map

```
src/content/
├── index.js                 entry point / bootstrap
├── constants.js              storage keys, palettes, THEMES
├── state.js                  shared mutable store
├── services/                 network calls (Canvas API, dining API, task-load orchestration)
├── storage/                  localStorage get/set pairs (caches, starred, hidden courses, custom assignments...)
├── utils/                    pure helpers (colors, dates, text parsing, grade math)
├── components/                reusable UI pieces (PDF modal, assignment modal, confetti, widget shell)
├── views/                     the 5 tab renderers (upcoming, grades, dining, general, announcements)
└── handlers/                  keyboard shortcut controller
```

See the accompanying chat message for the full function → file mapping and
the reasoning behind each module boundary.
