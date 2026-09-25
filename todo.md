# Etymolog — needs a human decision / cannot be done autonomously

Items the redesign could not resolve without the owner, plus what Phase 8
measured but deliberately did not change and what the word generator left as a
measured band rather than a guarantee. Each entry says what was done instead so
nothing is silently blocked.

Last reviewed: 2026-09-25 (end of the block-script epic).

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

## From the block-script epic (2026-09-24/25, alpha `74e69cf`..)

Everything in `BLOCK_SCRIPT_PLAN.md` shipped (phases 1–7, 3097 tests green after the E2E fixes,
typecheck at the 37-error package baseline, live-checked in Chrome). What is
left needs the owner, or is polish deliberately not squeezed in.

### Decisions needed

- **Merge alpha into master.** Nine `(etymolog)` commits on the `alpha` lane
  (`7228a8b`, `74e69cf`, `17e2d5d`, `b1edd23`, then phases 2–6, the docs and
  the edit-form fix). Not merged: the lane was told to author, not integrate.
  `git -C <main> merge --no-ff alpha` from the MAIN tree fires the lite gate.
- **Schema v9 rebuilds `grapheme_glyphs`.** A user's existing `.sqlite` is
  migrated in place on first open (one transaction, rolls back on any FK
  violation, verified against a built v8 fixture). Worth a "back up your
  language first" note in the release announcement all the same.
- **Export envelope is v4.** Older builds cannot read a v4 file (they never
  could read newer ones); v1–v3 files still import here.

### Small follow-ups (nice to have)

- ~~**`missingGroup` is computed but never shown.**~~ Shown since the E2E
  follow-up (popover label + note, designer preview list).
- **Preview strip glyphs are small** for a 3-slot block of IPA fallbacks
  (`BlockPreviewStrip` uses the `PREVIEW_CONFIG` size). A larger `glyphEmPx`
  or a per-block scale would read better; check against real drawn glyphs
  before changing it.
- **With blocks OFF the display ignores pins** (`grapheme-12@34` draws the
  default form) — by design, to keep the no-scheme rendering byte-identical.
  The word-form canvas still shows the pinned form. Decide whether pins should
  apply without a scheme; if yes, drop the snapshot identity test knowingly.
- **Template editor switch drops un-applied edits silently** (opening Edit on
  another template while one has changes). The page-level unsaved guard still
  covers leaving the page.
- **`audit-phase5.test.tsx` "treats ɡ and g as the same sound" is a load
  flake** (fails only under the full 164-file run, passes alone). Pre-existing;
  not touched by this epic.

### Found and fixed on the way

- Every EDIT form opened dirty ("Leave site?" on an untouched word): the stored
  pronunciation was seeded with `markChanged` on. Fixed in
  `LexiconFormFields` + pinned by `LexiconEditorDirtyOnMount` (edit cases).
- Lint: `react-refresh` / React-compiler errors in `LogogramPanel`,
  `GraphemeFormFields`, `GraphemePickerModal`, `LexiconAutoSpellLock.test`.
- **E2E pass (2026-09-24):** a clicked template slot was selected but not
  focused (pointerdown `preventDefault` cancels focus-on-press), so the
  "Arrows move, Shift+arrows resize" hint did nothing after a mouse click.
  `RectLayoutEditor` now focuses the rect; pinned by two tests.
- **E2E pass:** a wide form could never fill a wide slot — every drawn glyph
  keeps the editor's square 300 × 300 canvas as its viewBox, so `meet` shrank
  it to a square. Block slots now fit each sign's INK (`nestSvgToInk`,
  `db/utils/svgInkBounds.ts`); unmeasurable sources (text, images, transforms,
  multi-glyph rows) fall back to the old nesting byte-for-byte. Non-block
  rendering is untouched.

### Seen in the E2E pass — fixed in the follow-up (2026-09-24)

- **Word-form canvas insertion point.** The canvas is focusable (click or Tab);
  the arrows (following the writing direction), Home and End move a visible,
  announced caret; keys, the Boundary key / `.` and Backspace act AT it (the
  cursor strategy is the default now — with no cursor it appends exactly like
  before). Clicking focuses it even though the pan surface prevents default.
- **"Auto (head)" for a sign with no head form** now reads "Auto (default form
  — no head form)" with a note, in the popover; the designer preview lists the
  same fallbacks (`summarizeBlocks().missingForms`, from the composer itself).
- **Thin strokes in small blocks**: ink-fitted cells draw a 1-screen-pixel
  `non-scaling-stroke` hairline under each mark, so a 2 px pen line stays
  visible at 36 px and is covered by the real ink at normal sizes.
- **Page error boundary** (`shell/PageErrorBoundary`) around the routed page:
  a crash shows a "This page stopped working" card (try again / reload),
  the tabs stay usable, and navigating away clears it.

### Seen in the E2E pass — the last four, also fixed (2026-09-24)

- **Multi-glyph forms are ink-fitted too.** `estimateInkBounds` measures the
  nested `<svg>` cells a multi-glyph row is made of (through each cell's
  `xMidYMid meet` viewport, clipped to it), and the hairline floor goes
  inside each cell. Other viewports (`preserveAspectRatio="none"`, no size,
  a transform) still fall back to the full canvas.
- **Shift+↑ no longer re-snaps the width** (and a sideways nudge no longer
  re-snaps y): `moveRect` / `resizeRect` snap only the axis that changed.
- **Unknown addresses inside a tab** (`/script-maker/graphemes/create`,
  `/lexicon/nope`, …) show a "There is no page here" notice with the way
  back (`shared/notFound`), instead of an empty panel — and the two silent
  redirects (shell `*`, Writing System `*`) show it too.
- **Tapping a tile places the caret** before it (leading half) or after it
  (trailing half), in the writing direction; a press that moved is a pan.
  The block outline opens its popover from its BORDER now, so taps inside a
  block reach the tiles.

## From the block placement follow-up (2026-09-24, `BLOCK_PLACEMENT_PLAN.md`)

Shipped on `alpha`: `65cf0fa` (Phase A — engine: slot `pin` / `fill`, `preserveAspectRatio` mapping, `estimateInkBounds` for every align × meet/slice),
`ff638f6` (Phase B — designer: pin picker + fit/fill select in `SlotSettings.tsx`, three resize handles in `RectLayoutEditor.tsx`, `slotPlacement.ts`),
this commit (Phase C — "On this page" contents, docs). Known limits, none blocking:

- **A sign can only span a flat box by OVERFLOWING it, never by stretching.**
  This is by design — the owner rejected stretching. Fill grows the sign until
  it spans the box's longer side and the rest spills past the box edges.
- **Overflow is clipped at the block edge.** The block root `<svg>` viewport
  clips, so a sign that overflows its box is cut off at the block's own edge —
  it never runs into the next block in a word.
- **Overflow may overlap a neighbouring box inside the same block.** Filling one
  box can make its sign spill over an adjacent box in the same block; the
  designer sees this at once in the live preview and moves/resizes to taste.
- **A multi-sign slot applies ONE pin/fill to every part.** Every sign sharing a
  slot uses that slot's single pin and fill; there is no per-part placement.
- **Live-checked (Chrome, alpha `localhost:5178`, the Rabomaya language, editor cancelled afterwards so nothing was saved):** the "On this page" row (7 links, click scrolls + focuses the section, URL hash stays empty); Template 2 → C2 selected → three handles (corner 16×16, right 16×30, bottom 48×16, each with a 28px hit area and the right cursor); pin `bottom` + Fill → the C2 cell reads `xMidYMax slice overflow="visible"` and the live preview draws the bottom sign wider than with Fit; the right-edge handle drag changed only the width (100% → 75%).
- **Not live-checked:** the bottom-edge handle drag (unit-tested: height only) — the Chrome extension dropped mid-batch; a saved scheme with a filled box drawn in the Lexicon word list (unit-tested through `composeBlock` only).
- **Flaky test:** `blocksPage.test.tsx › consonants that can carry a syllable …` failed once in a full run (3775 tests) and passed alone and on two full reruns. Timing-dependent; worth a `findBy`/`waitFor` look when it recurs.

## From the conlang-edges follow-up (2026-09-24, CONLANG_EDGES_PLAN.md)

Shipped on `alpha`: `8a8e59c` (marks ride with the sign before them, `‿` joins, stress marks cut), `7b7fc4b` (syllable-sign codas, syllabic consonants),
`8648774` (designer: consonant list, Join key, mark role preset), `858775e` ("Check all my words"). Known limits, none blocking:

- **A mark between the two vowels of a diphthong blocks the glue.** `a MARK i`
  with `ai` listed stays `aM · i` (a group must be contiguous vowels, and a
  V box does not take a mark). Workaround: put the mark after the pair
  (`a i MARK`).
- **A join never licenses a syllable start.** `as‿ta` with s + consonant off
  is `ast · a`: the join forbids the `s|t` cut, and `st` still is not a legal
  start, so the only allowed cut is before the last vowel.
- **A join next to a logogram does nothing** (nor one BEFORE a syllable
  sign). Those stay walls; only a template (`LOGO C V`) joins them to a
  neighbour. A join right AFTER a syllable sign does count: it forbids that
  cut, so `KA‿t a` is `KAt · a`.
- **A syllabic consonant is class C, not V** (pitfall P-B1, on purpose — a
  listed `r` must not fill every V box). `prst` with `r` listed is ONE
  syllable, but a `C V C` template cannot take it (it falls back to template
  order: four lone consonants); it needs a template whose core role accepts
  a consonant (`class R`, `any`, …). The list's description says so.
- **The seed offers no core template.** "Start from the word generator"
  (`seedFromGenerator.ts`) builds no role / template for a syllabic core, so
  an owner who lists `r` must add a `C R C`-style template by hand.
- **Syllabic-consonant suggestions come only from the signs' sounds**
  (`suggestSyllabicConsonants`: each grapheme's main sound that is a nasal,
  lateral, trill, tap or approximant). Consonant runs actually used in the
  words are not scanned, and a sound already written `r̩` is not offered
  (it is a core anyway).
- **How listed consonants become cores** (not a limit — the rule, for
  reference): a listed consonant is a candidate when neither neighbouring
  non-mark sign holds a vowel (a vowel, a marked syllabic consonant, or a
  syllable sign — `KA r t a` is `KAr · ta`). Of several candidates in a row
  only the LAST is the core: `mlha` with `m l` listed is `ml · ha`;
  `vlkr` with `l r` is `vl · kr` (not in a row); `sedm` with `m` is
  `se · dm`. A logogram or unknown sign holds no vowel (`L r t a` →
  `L · r · ta`). Both IPA syllabic marks count (U+0329 below, U+030D above).
  A core that ends up alone is drawn without the vowel-killer mark.
- **Syllable-sign codas are for `syllable` signs only.** A logogram followed
  by consonants still leaves them to the next syllable (`LOGO n t a` →
  `LOGO · nta`); a logogram coda would need its own rule. A sign whose coda
  consonants are all joined away (`KA s‿t‿a`, s + consonant off) grows
  nothing.
- **The word check's stale note tracks the draft, not the lexicon.** The
  report is flagged stale when the scheme changes (`report.scheme !==
  scheme`); a word added, edited or respelled after the check is not, so
  run it again after lexicon work.
- **Live-checked in Chrome (alpha, demo language):** the second list (add `r`,
  save, reload, remove, save — no phantom "Unsaved changes"), "Try a word"
  with `prst` / `krtek` / `ta‿i` / `kaˈta` / `a‿t‿a`, the `.`/`‿` note,
  "Check all my words" (report, stale note, "Try it" → preview), and the
  Join key on the word form (`pa‿a` became one block outline, the ‿ tile
  drew, Backspace removed it; the form was cancelled).
- **Not live-checked:** a mark GRAPHEME inside a block. The word keyboard
  lists no `mark`-category sign (marks are kept out of auto-spelling and the
  glyph keys), so a `C V MARK` block can only be reached by pasting a
  spelling or once the keyboard offers marks — unit-tested in
  `segment.test.ts` / `compose.test.ts` / `conlangEdges.audit.test.ts`.
  Also not live-checked: a syllable-sign word (the demo has no syllable
  sign) and the `mark (accent, tone…)` role preset (unit-tested in
  `rolesEditor.test.tsx`).

## From the diphthong follow-up (2026-09-24, `DIPHTHONG_BLOCKS_PLAN.md`)

Shipped on `alpha` (diphthongs stay in one block; several-consonant signs are
consonants; grapheme-form sound hint). Known limits, none blocking:

- **A several-consonant sign starts a syllable only on its own.** `ng` has no
  sonority profile, so `angwa` (one `ng` grapheme + `w`) splits `ang · wa`,
  not `a · ngwa`. If a script needs it, judge such a sign by its LAST member
  sound in `onsetAccepts` (syllabify.ts) — behind a test, since it changes
  splits for every multi-sound consonant sign.
- **Diphthongs glue at most three vowel signs** (`MAX_GLUED_UNITS`).
- **Suggestions come from the word-generator shapes only** (`[ai au]`
  literal groups written WITH spaces — `[ai]` means "a or i" to the parser).
  Vowel pairs actually used in the language's words are not scanned.
- **Not live-checked:** a saved grapheme whose sound is `ng` filling a C box
  (unit-tested in `classify.test.ts` / `segment.test.ts`; the live check
  covered the hint and the diphthong path).

## From the syllable-blocks follow-up (2026-09-24, `SYLLABLE_BLOCKS_PLAN.md`)

Shipped on `alpha` (syllable splitting, flexible boxes, vowel-killer mark).
Small things left:

- ~~**Logograms in syllable mode** are their own unit, so a `LOGO C V`
  template only matches in template order. If a script needs a logogram
  inside a syllable block, let syllabify treat a chosen category as a
  consonant/vowel, or offer a per-role "joins the next syllable" option.~~
  Done: a lone logogram / syllable sign joins the following (else the
  previous) syllable when a template covers the joined range — no setting.
- **Several signs in one box get small** at word-preview size (three
  consonants share a half-width box). A block could grow wider when a box
  holds several signs, or the word preview could render larger. (Eased: a
  shared box is now split by each sign's ink shape, not equally.)
- ~~**"No template matched" in a caption** also shows when every sign was drawn
  with the vowel-killer mark (`s · t`); reads slightly alarming — could say
  "no blocks".~~ Done: the caption lists only non-zero parts
  (`s · t → 2 consonants with a vowel-killer mark`).
- **The vowel-killer mark is any grapheme.** A dedicated "mark" kind (hidden
  from auto-spelling pickers, shown in a Marks filter) would make it easier
  to find.
- ~~**"Add templates from my word shapes"** still makes one template per
  shape; it could now make one flexible template (`C(up to 3) V C(up to 3)`).~~
  Done: the button offers "One flexible template" (recommended) or "One
  template per shape" (`seedFlexibleTemplate`).

## From the logograph epic (2026-09-09, feat/etymolog-logograph)

- **Push + mirror deploy + notify the feedback author.** The epic (pronunciation-optional
  words, image import, word symbols, compound builder, nested folders — LOGOGRAPH_PLAN.md)
  is merged-ready on the branch with docs/ rebuilt at v0.4.0. Pushing master and
  re-snapshotting the Kerbash/etymolog mirror are human steps (see
  README §Deployment); the feedback author offered to re-test — worth taking up once live.
- **Symbol mode-switch on edit can orphan a grapheme on retry.** Switching a word INTO
  Symbol mode on edit mints the symbol grapheme before the word update; a failed save +
  retry mints another (unreferenced only, no corruption). Tightening (mint inside the
  update, or reuse the last-minted id) is a small follow-up.
  *Done instead:* documented; final audit verified no data corruption.
- **Corrupt-import folder cycles.** A hand-crafted v2 export with a parent_id cycle
  imports successfully but those folders are unreachable (never at root). All tree walks
  carry visited-guards so nothing hangs. A cycle-break pass in validateExport would be
  more complete.
- **Custom phoneme inventory (beyond-human-anatomy sounds).** The free-text IPA field
  already accepts any character (the feedback author uses this); a first-class custom
  phoneme inventory is a separate epic.
- **Logograph-friendly mode setting** (re-ordering form sections symbol-first) and
  **folder drag-and-drop reordering** (position column exists; UI is click-to-move) —
  deliberate scope cuts.

## From the tree-explorer epic (2026-09-09, feat/etymolog-tree-explorer)

The epic (folders for words, glyphs AND graphemes, rendered as an inline
collapsible tree — `TREE_EXPLORER_PLAN.md`) is merged-ready on the branch with
`docs/` rebuilt at v0.5.0.

- **Push `master` to origin** (human decision).
- **Re-snapshot the Kerbash/etymolog Pages mirror** after the merge (see
  README §Deployment).
- **Tell the feedback author** folders now cover **glyphs and graphemes too, not
  just words**, and are browsed as an inline collapsible tree (expand a folder in
  place, cap-and-focus at 12 items, deep-linkable `?folder=`). They offered to
  re-test — worth taking up once live.
- **Fix the permanently-mounted-`Modal` pattern in cyber `Modal` itself.** Three
  unrelated modals — `exportImport/ImportJsonModal.tsx`,
  `exportImport/ImportImageModal.tsx`, `display/customChart/CreateChartModal.tsx`
  — still carry the same latent shape that stranded an invisible click-eating
  overlay for the folder dialogs (fixed locally in `339ec01` by gating the whole
  `<Modal>` on `isOpen`). The durable fix belongs in cyber `<Modal>` (own the
  mount/unmount so consumers can keep the `{isOpen && ...}` inner gate); it was
  out of scope here (additive-only `packages/` constraint). **Separate task.**
- **Pre-existing lexicon v7 folder-persistence bug was also fixed by `b085b24`.**
  Folder rename / move and `setLexiconFolder` (move-word-to-folder) never marked
  the DB dirty in v0.3.x, so those mutations did not survive a reload. The engine
  fix closes it for all three domains at once — worth mentioning to the feedback
  author, since v0.3.x users could have lost folder renames/moves.
