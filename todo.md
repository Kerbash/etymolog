# Etymolog — needs a human decision / cannot be done autonomously

Items the redesign could not resolve without the owner, plus what Phase 8
measured but deliberately did not change and what the word generator left as a
measured band rather than a guarantee. Each entry says what was done instead so
nothing is silently blocked.

Last reviewed: 2026-08-22 (end of the word-generator work, Phase 6).

## Decisions needed

- **Remove unused dependencies (`style-switcher`, `nochi-oauth`) from
  `apps/etymolog/package.json`.** Neither is imported anywhere in the app.
  Removing them changes `pnpm-lock.yaml`, which must be done from the MAIN tree
  (never `pnpm install` from a worktree).
  *Done instead:* left in place; dark mode uses `DarkmodeSwitch` + `[data-theme]`.

- **Self-host the Google Fonts (Chakra Petch, Bitcount Prop Single).**
  The PWA is offline-capable but the fonts are fetched from googleapis on first
  load. Self-hosting needs the font binaries committed plus the OFL notice — a
  licensing/asset decision.
  *Done instead:* the two render-blocking CSS `@import`s were moved to
  `<link rel="preconnect">` + `<link rel="stylesheet">` in `index.html` with the
  existing workbox runtime cache.

- **Public repository name / GitHub Pages base path.** `vite.config.ts`
  defaults `base` to `/etymolog/`; the README still carries the placeholder
  `REPO_NAME` deploy instructions.

- **Conlang settings in SQLite.** Settings live in `localStorage` and travel
  with a JSON or PNG export (the envelope embeds them), but NOT with a raw
  `.sqlite` file — so a conlang moved that way arrives with the receiving
  browser's settings. Fixing it means a `settings(key, value, type)` table and a
  migration; the export envelope would keep embedding them for older importers.
  *Done instead:* documented in the README ("Known Issues → By design") so the
  limitation is visible at the point a user would hit it.

## Word generator

Added at the end of the word-generator work (Phase 6). Everything here is either
a decision the owner should make or a measured band the implementation
deliberately did not turn into a guarantee.

- **Text-to-speech playback of a generated word.** Browser `speechSynthesis`
  cannot read IPA — it reads the letters as text in whatever voice is installed,
  which for `kʷaːt͡ʃi` is noise. eSpeak-ng (WASM, ~2 MB, offline, true IPA input,
  robotic voice) is the only faithful option and it is a DEPENDENCY: a lockfile
  change, which must be done from the MAIN tree, plus a quality decision the
  owner should hear before it is made. The cheaper approximation —
  transliterate to a near-phonemic language and use that browser voice — is a
  vibe, not a pronunciation.
  *Done instead:* not built. The seed and the syllable dots (`ta·ki·no`) are the
  affordances the page offers for saying a word out loud yourself.

- **`island`'s "no three consecutive vowels" is a BAND, not a guarantee.**
  Measured at ~4 % over 500 words (the ratchet in
  `src/generator/__tests__/quality-phase3b.test.ts` allows < 6 %). A hard zero
  needs the bare `V` template gone from the preset, which costs the vowel-initial
  words that are half of what makes the flavour sound Polynesian.
  *Done instead:* the repeated-vowel `forbidden` recipe (15 entries banning
  `aa`/`aːa`/`aaː` × 5 vowels) plus `longVowelChance` 0.15 → 0.08, which took
  repeated vowels to zero; three DIFFERENT vowels in a row is what remains.

- **The duplicate-template check is TEXTUAL.** `CV` and `C V` parse to the same
  shape, but `ShapeEditor`'s "already have it" test and the settings validator's
  de-dupe both compare the raw pattern string, so both can sit in one profile and
  the shape simply fires twice as often as its weight says. Fixing it means
  canonicalising a parsed template back to a string (or comparing item lists),
  which is a new function with its own edge cases (`(C)V` vs `( C )V`).
  *Done instead:* pinned as behaviour in
  `src/generator/__tests__/audit-phase2.test.ts`; the quick-add buttons and the
  `SHAPE_LADDER` only ever offer canonical spellings, so the duplicate is
  reachable only by typing one out by hand.

- **A stale `guidePresetId` cannot be cleared by re-picking "No guide".**
  If settings hold an id no preset matches (a hand-edited export, a preset
  removed in a later version), `GuidePicker` shows "No guide" selected — so
  choosing "No guide" is a no-op write-guard hit and the stale string stays in
  storage. Harmless: `getPreset` returns `null`, the chart paints nothing and the
  legend does not render. Clearing it would mean either validating
  `guidePresetId` against `PRESET_IDS` (which creates a `profile → presets`
  import cycle) or having the picker write on a no-op change.
  *Done instead:* pinned in `audit-phase4.test.tsx` ("paints nothing for a stale
  id"); picking any real flavour overwrites it.

- **The `?pronunciation=` prefill effect is a no-op under StrictMode.**
  `LexiconFormFields` sets the field value once after mount, mirroring the
  edit-mode effect — but under StrictMode's double-invoke the second pass finds
  the value already present and does nothing, and in production the
  `defaultValue` has already reached the DOM by then anyway. So the effect is
  belt-and-braces that never has to act.
  *Done instead:* pinned in `audit-phase5.test.tsx`; the behaviour the user gets
  (field prefilled, form NOT dirty, leave-guard quiet until they type) is
  asserted directly rather than through the effect.

- **Only one notice is visible when a batch add partly fails.** "Added 3 words"
  and "2 words could not be added" are two calls into `NotificationProvider`,
  which shows one at a time — so the success toast covers the failure list until
  it auto-hides. Merging them into a single notice means a two-severity
  notification the provider has no shape for.
  *Done instead:* the failing rows STAY in the list with their selection intact,
  so the state on screen is correct whichever toast the user sees; pinned in
  `audit-phase5.test.tsx`.

- **A raw `.sqlite` export still does not carry the `wordGenerator` settings.**
  The profile and `guidePresetId` are a settings key, so they travel in the JSON
  and PNG envelopes and not in a bare database file — exactly the same
  limitation as `customCharts`, and the same fix (a `settings(key, value, type)`
  table plus a migration) closes both at once. See "Conlang settings in SQLite"
  above; this is a second reason to do it, not a second problem.
  *Done instead:* documented in the README's "Word generator → The profile, and
  where it lives" at the point a user reading about the profile would ask.

- **Edit mode of the word form is dirty on mount by design.** `LexiconFormFields`'s
  edit-mode effect calls `setSmartFieldValue(pronunciationField, …)` with the
  default `markChanged: true`, so every EDIT form prompts "Leave without saving?"
  even when nothing was changed. The create form was fixed (Phase 6c —
  `useEditedSinceMount`, StrictMode-safe); edit mode was left as documented.
  *Done instead:* noted here; the fix is to pass `{ markChanged: false }` on the
  edit-mode initial write and prove it with the StrictMode test in
  `src/components/tabs/lexicon/__tests__/LexiconEditorDirtyOnMount.test.tsx`.

- **`packages/smart-form/input/basic/draggableBlock/draggableBlock.tsx` carries the
  same defeated `isInitialRender` ref latch** (and its dep array includes a fresh
  `fieldState` object each render, so the latch is defeated on the second render
  even without StrictMode). It only sets `isTouched`, so it does not dirty a form,
  but it is the template the four etymolog composite inputs were copied from.
  *Done instead:* left untouched to keep Phase 6c inside etymolog; port
  `useEditedSinceMount` into the package when it is next touched.

## Measured in Phase 8, deliberately NOT changed

- **The PERSISTENT status colours fail WCAG AA as text in the light theme.**
  Measured against every background token in `index.css`:
  `--status-good` 2.74:1 (worst case, on `--bg-secondary`) and
  `--status-disabled` 2.52:1. Both were left alone:
  `--status-good` is never used as text in this app (only as an
  `--ancestry-color` badge fill and tree connector), and disabled text is exempt
  from WCAG 1.4.3. CLAUDE.md also specifies the persistent family as
  deliberately vibrant. The TRANSIENT family (`success` / `warning` / `error` /
  `info`), which IS used as small text, was deepened in light mode and now
  clears 4.5:1, as did `--text-secondary-muted` in both themes and
  `--status-bad` in dark. `src/styles/__tests__/tokens.test.ts` now recomputes
  all of it, so the exemptions are explicit rather than accidental. **If
  `--status-good` or `--status-disabled` ever becomes text, add it to
  `TEXT_TOKENS` in that test and re-tune.**

- **Header control hit areas are 23–26px tall** at 360px wide (rename 33×23,
  export/import 99×26, theme 45×15). WCAG 2.2 SC 2.5.8 asks for 24×24 unless
  spacing compensates, so the rename and theme controls are marginal. Fixing it
  properly means re-tuning `IconButton`'s padding in cyber-components, which
  changes every consumer's chrome — out of scope for a hardening pass.

- **Reduced motion could not be verified live.** `TabContainer`'s panel
  crossfade and `NotificationBanner` now consult `useReducedMotion()` and swap
  with `duration: 0`, and the CSS `@media (prefers-reduced-motion: reduce)`
  block in `index.css` covers everything else — but the in-app Browser pane
  cannot emulate the media query, so the motion/react half is verified by code
  review only. Worth one pass in a real browser with the OS setting on.

- **Two smart-form inputs indicate focus with a border colour only**
  (`floatingInput` in the custom-keyboard overlay, and one `.input:focus` rule).
  Neither renders on any etymolog page today, so nothing here regresses; a
  border-colour-only indicator is a weak SC 2.4.7 pass and should be given a
  ring when that package is next touched.

## Tooling gaps during the autonomous run

- **Claude-in-Chrome was not connected** (`list_connected_browsers` returned
  empty) for Phases 7 and 8, so browser verification used the in-app Browser
  pane (`localhost:5174`, worktree build) with text/JS inspection only — the
  hidden pane cannot produce screenshots. Everything structural was measured
  with `javascript_tool` (element boxes, scrollWidth, computed styles, the CSS
  rule tables). A **visual** pass in a real browser is still worth doing: the
  dark theme's look (not its contrast, which is now ratcheted), the glyph
  drawing canvas, and the tab strip's arrow mode.
- **The hidden pane freezes `requestAnimationFrame`**, so `AnimatePresence`
  exit animations never complete and stale tab panels accumulate in the DOM
  across SPA navigations. Every measurement above was taken either after a full
  reload or in a form where stale panels cannot affect the result. Not a leak in
  a real browser.

## Verified manually only (no automated coverage possible)

- IndexedDB persistence and the `previous` snapshot rotation were verified in
  Chrome (DevTools → Application) — neither Node nor happy-dom provides
  IndexedDB, so the adapter is exercised through the memory/localStorage
  adapters in tests and through the browser by hand.

## Small follow-ups (nice to have, not blocking)

- **Enter in the pronunciation field does not submit the word form.** Noted in
  `audit/usability-walkthrough.md`; SmartForm's submit is a button, and adding
  implicit submission to a form containing nested table inputs needs care.

## Resolved since the last review

Kept only as a record of what these entries used to say.

- ~~`apps/etymolog/docs/` is rebuilt only in the final release commit~~ — done in
  Phase 8; `docs/` in the working tree is the current build.
- ~~Lint baseline of 15 errors~~ — 0 errors / 0 warnings.
- ~~~21 pre-existing TypeScript errors~~ — 0 for the app (`packages/smart-form`'s
  own `process` typings still fail and are filtered with `grep -v packages/`).
- ~~`useDrawing`'s `onChange` never fires for a glyph drawn from scratch~~ —
  fixed and covered by `packages/cyber-components/interactable/canvas/svgDrawer/__tests__/useDrawing.test.tsx`;
  verified live (draw a stroke, click another tab, get "Leave without saving?").
- ~~The empty-lexicon state mentions the Script Maker but does not link to it~~ —
  closed by the word generator's Phase 5: `LexiconGallery`'s empty state now
  offers three real links (Script Maker, Generate words, Create your first word).
- ~~The header's Export and Import dropdown toggles are `<div aria-haspopup>`~~ —
  real `<button>`s with accessible names, covered by
  `src/components/exportImport/__tests__/ExportImportButtons.test.tsx`.
