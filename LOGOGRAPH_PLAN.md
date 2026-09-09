# Logograph-Friendly Etymolog — Plan

Driven by real user feedback from a logographic-conlang author (2026-09-09). The tool
today is alphabet-first: a word's identity is its pronunciation, its spelling is a chain
of graphemes, and every symbol must be hand-drawn in-app. This epic makes the word-level
(logographic) workflow first-class WITHOUT regressing the alphabet workflow.

Worktree: `.claude/worktrees/alpha`, branch `feat/etymolog-logograph` (off master `2110bf2`).
All work stays inside `apps/etymolog/` — NO package edits (see §6.1).

---

## §1 Feedback → use cases

The verbatim themes from the feedback, mapped to concrete use cases:

- **UC-A — Pronunciation must not be a gate.** "requiring the pronunciation in order to
  add another word is not ideal … The plan I had was to go and make the symbols, and then
  think of phonetics later." → A native word must be creatable with NO pronunciation.
  (Bonus already true: the IPA input accepts non-IPA characters — keep that.)
- **UC-B — Define words solo or as chains of words, without touching graphemes/glyphs.**
  "my combo that makes up 'boredom/sleepiness' would probably be 'night' + 'affliction' …
  Just creating or uploading the symbol for the whole word, since that's the scale the
  logographs deal with." → (B1) attach a whole-word symbol from inside the word form —
  draw OR upload — with zero visits to Script Maker; (B2) build a word as a chain of
  existing words (ancestry types `compound`/`blend` already exist) and reuse the chain
  members' symbols as the new word's spelling in one click.
- **UC-C — Import images as symbols.** "allow people to import images … since my symbols
  have been made in Google Drawings and I'd love to just make them into PNGs and plop
  them over." → PNG/JPEG/WebP/SVG file upload wherever a glyph can be drawn.
- **UC-D — Nested folders.** "I have my folders set up very nested … Nouns,
  People/Entities, Entities, Mythological, Divine, Gods, De'ura." → arbitrarily nested
  folders for lexicon entries, with breadcrumb navigation in the Lexicon gallery.

## §2 Current-state findings (verified against source, 2026-09-09)

- `lexicon.pronunciation` is ALREADY nullable in the DB and the service layer already
  tolerates null everywhere: ordering uses `COALESCE(pronunciation, lemma)`
  (`lexiconService.ts:117`), `getAutoSpelledLexiconMentioning` filters
  `pronunciation IS NOT NULL` (`lexiconService.ts:397-401`), so respell skips them.
  The gate is purely at two UI/API points:
  1. `LexiconFormFields.tsx` ~line 245: `required: { value: true, message: "Pronunciation is required" }`.
  2. `lexiconApi.ts` ~line 101-109: lemma is derived from pronunciation and errors with
     `'Lemma or pronunciation is required'` when both absent.
- `lexicon.lemma` is `NOT NULL` (schema.ts:124). The lemma input was removed from the UI;
  the API backfills lemma = pronunciation. Display name = `lexiconDisplayName()` =
  pronunciation ?? lemma (`components/tabs/lexicon/lexiconIdentity.ts`).
- Spelling source of truth is `lexicon.glyph_order` (JSON array of `"grapheme-<id>"` or a
  bare IPA string); `lexicon_spelling` is a derived index. Writers funnel through
  `updateLexicon` → `syncLexiconSpellingFromGlyphOrder`.
- Ancestry already supports `'derived' | 'borrowed' | 'compound' | 'blend' | 'calque' | 'other'`
  (`db/types.ts:306`), cycle-checked via a closure table. The word form has `AncestryInput`.
- Glyphs are stored as sanitized SVG text (`glyphs.svg_data`); `sanitizeSvg()`
  (`db/utils/sanitize.ts`) uses DOMPurify `USE_PROFILES: { svg, svgFilters }`, max 500 KB.
- `normalizeGlyphSvg.ts` rewrites every `fill`/`stroke` to `currentColor` on save
  (theme-following ink). It only touches paint attributes/declarations — it will not harm
  an `<image>` element.
- Glyph create/edit share `GlyphFormFields` + `useGlyphSubmit`; drawing is
  `SvgDrawerInput` (smart-form) with a single `currentColor` ink (`GLYPH_INK`).
- Export/import: versioned JSON envelope, `EXPORT_SCHEMA_VERSION = 1`
  (`config/version.ts:65`); **import hard-rejects any other version**
  (`db/exportImport/jsonCodec.ts:126`). Table lists live in `db/exportImport/types.ts`
  (`TABLE_ORDER` etc.).
- Migrations: `PRAGMA user_version` registry, `CURRENT_SCHEMA_VERSION = 6`
  (`db/migrations/version.ts`). A fresh `createSchema()` DB and a migrated DB must be
  identical (asserted by `migrations.test.ts`).
- Lexicon list page: `components/tabs/lexicon/galleryLexicon/LexiconGallery.tsx` (~244
  lines); word form: `editor/LexiconEditor.tsx` (one component, create+edit modes).

## §3 Phases

Each phase is independently testable, gets its own commit(s), and ends with the full gate
(§4) green. Order matters: P1 unblocks the workflow, P2 builds the image infrastructure
P3 consumes, P5 is independent but biggest, so it goes after the word-form work settles.

### Phase 1 — Pronunciation-optional words (UC-A)

1. `LexiconFormFields.tsx`: drop the `required` validator on `pronunciation` (keep max
   length via service). Update the tooltip/help text: pronunciation is optional; auto-spell
   needs one. The create page description ("Type the pronunciation first…") in
   `LexiconEditor.tsx` must change to not presuppose pronunciation.
2. Form submittability: SmartForm's `isSubmittable` is `isValid && !isEmpty` — with
   pronunciation empty, SOMETHING must make the form submittable. Verify how
   `registerForm`'s `isSubmittable` composes across fields (read
   `packages/smart-form/README.md` §form state); if an all-optional form reports
   not-submittable while empty, register the meanings field as the anchor or relax via
   the documented SmartForm option — do NOT hack the DOM. Requirement: a word with only
   a meaning (no pronunciation) must be creatable; a word with NEITHER pronunciation NOR
   any meaning must be rejected with a clear message (there is nothing to name it by).
3. `lexiconApi.ts` `createLexicon`: extend the lemma fallback chain:
   trimmed `request.lemma` → trimmed `pronunciation` → **first non-empty meaning**
   (`request.meanings[0].meaning`, falling back to `request.meaning`) → error
   `'A word needs a pronunciation or at least one meaning'`. Mirror the same rule in
   `updateLexicon` (api, ~line 301): never let an update null the lemma out; when
   pronunciation is cleared on edit, recompute lemma with the same chain (existing lemma
   as final fallback).
4. `lexiconDisplayName()` — keep as is (pronunciation ?? lemma; lemma now carries the
   meaning-derived name). BUT sweep every surface that renders `pronunciation` raw:
   lexicon gallery card, view page header, translator, ancestry node display, word
   generator "Edit & add" flow, delete confirmations. Anywhere that would render an empty
   string must fall back to `lexiconDisplayName` (or show an explicit "no pronunciation
   yet" muted hint on the view page).
5. Auto-spell UX with no pronunciation: `handleRequestAutoSpell` already answers "Enter a
   pronunciation first" — keep, but the Auto-spell checkbox help text should say
   pronunciation-less words simply keep manual spelling. `auto_spell=1` with null
   pronunciation is legal and inert (respell candidate query skips it) — add a regression
   test proving a phoneme edit does NOT touch such words.
6. Tests (new file `src/db/__tests__/pronunciationOptional.test.ts` + form-level tests in
   `src/components/tabs/lexicon/__tests__/`): create native word with meaning only; lemma
   derivation chain incl. `meanings[0]` vs legacy `meaning`; update clearing
   pronunciation keeps a usable lemma; reject word with nothing; display-name fallbacks;
   respell skip; search by meaning still finds it; sort stability with null pronunciation.

### Phase 2 — Image import infrastructure (UC-C)

New app-local module `src/components/form/glyphImport/` (+ pure helpers in
`src/db/utils/` where DB-adjacent):

1. **Sanitizer extension** (`db/utils/sanitize.ts`): DOMPurify's default
   `ALLOWED_URI_REGEXP` REJECTS `data:` URIs — an `<image href="data:image/png;base64,…">`
   is silently stripped. Extend `sanitizeSvg` to allow data URIs ONLY for raster image
   payloads: add a DOMPurify hook (or `ALLOWED_URI_REGEXP` override) that permits
   `^data:image/(png|jpeg|webp|gif);base64,` on `href`/`xlink:href` of `<image>` elements
   and NOTHING else (no `data:text/html`, no `data:image/svg+xml` — that's a script
   smuggling vector). Keep the existing profile otherwise. **Write adversarial tests**:
   `<image href="data:text/html,...">` stripped, `<script>` stripped, `onerror` stripped,
   `data:image/svg+xml` stripped, plain drawn glyphs unchanged byte-for-byte.
   DOMPurify hooks are GLOBAL to the module instance — register once at module scope or
   add/remove around each sanitize call deterministically (test double-sanitize).
2. **Raster import codec** (`src/components/form/glyphImport/rasterToGlyphSvg.ts`, pure,
   canvas-based): file → `createImageBitmap`/`Image` → downscale so the longest side
   ≤ 512 px → two modes:
   - **Line-art mode (default)**: read `ImageData`, compute per-pixel
     `alpha' = alpha × (1 − luminance)` (dark ink on light ground becomes opaque ink),
     write a WHITE-ink PNG with that alpha, embed it in
     `<svg viewBox="0 0 W H"><mask id=…><image …/></mask><rect fill="currentColor" mask=…/></svg>`
     — OR the simpler equivalent: paint the processed pixels as pure white and use the
     PNG directly under a mask. Either way the OUTPUT must recolor with `currentColor`
     so imported line art follows the theme exactly like drawn glyphs. Pick ONE
     implementation, prove it renders in both themes (see pitfalls §6.7), and unit-test
     the pixel math on synthetic ImageData (happy-dom has no real canvas — inject/mock;
     keep the pixel math in a pure function taking `{data,width,height}`).
   - **Keep-colors mode** (checkbox "Keep original colors"): embed the downscaled PNG
     as-is. Warn in help text that it won't adapt to dark mode.
   - SVG FILES uploaded directly: read text, run through `sanitizeSvg` +
     `normalizeGlyphSvg` (existing import path behavior), reject if empty after
     sanitize.
   - Size budget: after encoding, if the SVG string exceeds `LIMITS.SVG_DATA` (500 KB),
     re-encode at 256 px; if still over, reject with a human message. NEVER raise the
     limit (it multiplies export size and IndexedDB pressure).
3. **`GlyphImageImport` UI**: a compact control ("Import image…" button + drop target)
   rendered inside `GlyphFormFields` next to the drawing section, plus mode checkbox.
   On import: write the resulting SVG into the existing `glyphSvg` SmartForm field (same
   path a drawing takes — see how `SvgDrawerInput` holds its value; if the drawer can't
   display arbitrary SVG, show a static preview of the imported SVG in its place with a
   "Clear import / draw instead" toggle). The submit path (`useGlyphSubmit`) is unchanged
   — it already normalizes and the api sanitizes.
4. Tests: codec pixel math, size fallback, sanitizer adversarial suite, form integration
   (import → field value → submit payload), `normalizeGlyphSvg` leaves `<image>`+mask
   markup intact.

### Phase 3 — Word-level symbols in the word form (UC-B1)

The word form gains a third way to spell: **"Symbol" — draw or import ONE symbol that IS
the word**, creating the backing glyph + grapheme invisibly.

1. **Service** (`db/graphemeService.ts` or a new `db/wordSymbolService.ts`):
   `createWordSymbol({ name, svgData })` → in ONE `withTransaction`: sanitize svg, create
   glyph (name = `name`, category `'logogram'`), create grapheme (name = `name`, category
   `'logogram'`), link via `grapheme_glyphs` position 0, return `{ glyphId, graphemeId }`.
   `updateWordSymbolDrawing(graphemeId, svgData)` → finds the grapheme's single glyph and
   updates its svg_data (sanitized). Expose both through a new `api.wordSymbol` namespace
   in `db/api/` following the existing api-module pattern (ApiResponse envelope,
   `checkDbInitialized`).
2. **Composite create**: extend `CreateLexiconInput` with optional
   `symbol?: { name?: string; svgData: string }`. `api.lexicon.create`: when present,
   inside the SAME transaction as the word insert (`withTransaction` nests via
   savepoints — call the service functions, not the api wrappers, from inside
   `serviceCreateLexicon` or orchestrate both in one `withTransaction` at the api layer)
   create the symbol and set `glyph_order = ["grapheme-<id>"]` (symbol wins only when the
   caller sent no explicit glyph_order). Symbol name default: the word's display name
   (pronunciation or first meaning). A failure anywhere rolls the WHOLE thing back — no
   orphan glyph/grapheme (test this: force a failing meaning insert and assert glyph
   count unchanged).
3. **Form UI** (`LexiconFormFields` Spelling section): a segmented choice
   `Spelling: [Compose from graphemes] [Word symbol]` (default stays Compose; remember
   nothing — per-word choice, inferred in edit mode: a glyph_order of exactly one
   grapheme whose category is `'logogram'` opens in Symbol mode). Symbol mode shows: the
   Phase-2 import control + an inline `SvgDrawerInput` (reuse `GLYPH_INK`,
   `GLYPH_GUIDE_INSET`) and NO grapheme picker. The chosen SVG is held in local state and
   passed up to `LexiconEditor` (like `glyphOrder` is) → submitted as `symbol`.
   Edit mode with an existing symbol: prefill the preview; saving with a changed drawing
   calls `api.wordSymbol.updateDrawing`; switching a symbol-word back to Compose mode
   just writes a normal glyph_order (the old grapheme stays, unreferenced — that is fine
   and matches grapheme lifecycle elsewhere).
4. **Downstream surfaces** — verify, don't assume (each gets a test or an explicit
   audit-log note): lexicon card/view render a 1-grapheme spelling already (nothing to
   do); syllabary/IPA charts read PHONEMES, and logogram graphemes have none — confirm
   they are simply absent, not crashing; grapheme gallery will now show logogram
   graphemes — add a category filter chip if the gallery already groups by category
   (check `galleryGrapheme`), otherwise leave (they're honestly listed); respell service:
   logogram spellings are manual (`auto_spell` forced FALSE when symbol mode is chosen —
   set it in the submit path) so respell never rewrites them — test.
5. Tests: composite create atomicity, edit-mode inference, symbol update, auto_spell
   forced off, chart pages with phoneme-less graphemes, deleting the word leaves grapheme
   (documented behavior), deleting the grapheme via Script Maker still runs the existing
   `handleGraphemeDeletion` flow on the word.

### Phase 4 — Word chains: compound spelling builder (UC-B2)

1. In the word form, when ≥1 ancestor row exists and Compose mode is active, show a
   button **"Build spelling from ancestors"**: concatenates each ancestor's current
   `glyph_order` (in ancestry position order) into this word's glyph_order (replacing the
   canvas content after a confirm if non-empty). IPA fallback entries in an ancestor's
   spelling carry over as-is. Ancestors with EMPTY spelling contribute nothing — if all
   are empty, disable the button with a hint.
2. This makes "night + affliction = boredom" a 4-click flow: add 2 ancestors (type
   `compound`), press Build, save. No grapheme page visits.
3. Data note: the copied entries REFERENCE the same graphemes (no duplication) — a later
   edit of "night"'s symbol updates the compound automatically (via grapheme), which is
   the desirable logographic behavior; document in README.
4. Tests: build from 2 ancestors incl. one with an IPA fallback; confirm-overwrite path;
   empty-ancestor disable; ancestry reorder → rebuild order.

### Phase 5 — Nested folders (UC-D)

Split into 5a (data) and 5b (UI) — commit separately.

**5a — data layer**
1. Migration v7 (+ `CURRENT_SCHEMA_VERSION = 7`, `createSchema` kept in sync):
   `lexicon_folders(id INTEGER PK AUTOINCREMENT, name TEXT NOT NULL, parent_id INTEGER
   NULL REFERENCES lexicon_folders(id) ON DELETE CASCADE, position INTEGER NOT NULL
   DEFAULT 0, created_at/updated_at TEXT DEFAULT datetime('now'))` + index on
   `parent_id`; `ALTER TABLE lexicon ADD COLUMN folder_id INTEGER NULL REFERENCES
   lexicon_folders(id) ON DELETE SET NULL` + index. (SQLite allows ADD COLUMN with a
   REFERENCES clause when the default is NULL — no table rebuild, no `foreignKeysOff`
   needed; still end with `PRAGMA foreign_key_check` per the registry convention. Fresh
   path: add the same DDL to `createSchema` — `migrations.test.ts` proves equivalence.)
2. `db/folderService.ts` + `api.folder`: create (name 1–200 chars via
   `LIMITS.CATEGORY`-style constant), rename, delete, move(folderId, newParentId|null),
   list-all (one query; tree assembly in JS), `setLexiconFolder(lexiconId, folderId|null)`,
   plus `getFolderPath(id)` for breadcrumbs. **Cycle guard**: moving a folder under
   itself or any of its descendants must throw (walk the parent chain of the TARGET
   before writing — the table is small, a JS walk over list-all is fine). **Delete
   semantics**: deleting a folder REPARENTS its child folders and its words to the
   deleted folder's parent (service-level, in one transaction) — the FK cascades are
   belt-and-braces only, and nothing ever deletes a WORD. Depth cap 12 (matches the
   user's 7-deep example with headroom; enforced on create/move).
3. Export/import: add `lexicon_folders` to the envelope (`types.ts` TABLE_ORDER —
   parents before `lexicon`) and include `folder_id` in lexicon rows automatically (it
   exports `SELECT *`? — VERIFY how exportService reads rows; if column lists are
   explicit, add the column). Bump `EXPORT_SCHEMA_VERSION` to 2. **`jsonCodec.ts:126`
   must become**: accept versions 1..CURRENT; a v1 envelope imports with zero folders and
   all `folder_id` null. Round-trip test v2, backward-compat test with a captured v1
   fixture (build the fixture by exporting BEFORE the code change or by hand-crafting the
   v1 shape — do not synthesize it with the new exporter).
4. Tests: migration v6→v7 on a populated DB; fresh-vs-migrated schema equality; folder
   CRUD; cycle guard; reparenting delete; depth cap; export/import both versions; CRC
   persistence round-trip with folders present.

**5b — UI**
1. `LexiconGallery`: folder navigation — a breadcrumb row (`Root / Nouns / Entities`) +
   folder cards/rows listed ABOVE word cards, click to descend; "New folder" and
   rename/delete via the existing dialog components (`DialogPanel`,
   `ConfirmationOverlay tone='danger'` for delete, message stating children get moved
   up, not deleted). Words show in their CURRENT folder only; a "All words" toggle keeps
   the old flat view (and is the view SEARCH always uses — searching escapes the folder).
   URL state: `?folder=<id>` query param on the existing lexicon route (add nothing to
   ROUTES; read via `useSearchParams`), so back/refresh/deep-link work; invalid/missing
   id → root.
2. Word form: a folder picker (simple select rendering the tree with indented labels —
   no new package deps) in Basic information; create-mode default = the `?folder=` the
   gallery passed to `/lexicon/create` (extend the existing query-param pattern used by
   `?pronunciation=`); submit pipes `folder_id` through create/update inputs.
3. "Move to folder" on the word view page action bar (small dialog with the same tree
   select).
4. Tests: gallery navigation (folder click, breadcrumb, empty folder state), search
   escaping folders, create-in-folder default, move flows, delete-folder dialog wording.

### Phase 6 — Final audit, docs, release prep

1. Independent adversarial audit agent over the WHOLE diff (see §5 loop) — cross-phase
   interactions especially: symbol words inside folders exported/imported; compound
   builder + symbol mode; pronunciation-less symbol word end-to-end.
2. Update `apps/etymolog/README.md` (structure section + new features), `todo.md`
   (close/what's left), this plan's §5 log.
3. Full gates + browser smoke via dev server (launch config `omega-etymolog`, port 5174 —
   run from MAIN tree context; the app base is `/etymolog/`). Both themes. Create a
   pronunciation-less word with an uploaded PNG symbol in a nested folder, chain two
   words, export, wipe, import.
4. Version bump minor (0.3.0 → 0.4.0) via `node scripts/version-bump.mjs etymolog minor`
   (run from repo root of the worktree), then `npx vite build` in `apps/etymolog` (writes
   `docs/`) in a separate release commit — build AFTER the bump commit so the footer
   stamps correctly. Do NOT push; do NOT touch the Kerbash/etymolog mirror (human step —
   goes in todo.md).

## §4 Gates (run after every phase, from `apps/etymolog/` in the alpha worktree)

- `npx vitest run` — full suite green (baseline before this epic: see §5 P0 entry).
- `npx tsc -p tsconfig.app.json --noEmit` filtered: ignore lines matching `packages/`
  (pre-existing smart-form typing noise; `tsc -b` never reaches etymolog).
- `npx eslint src --max-warnings=0`.
- Commit per phase, BY PATH (`git add apps/etymolog/...` — never `-A`), message
  `(etymolog): <phase summary>`, body via `git commit -F <scratchpad file>`.

## §5 Execution log

- **P0 2026-09-09** — plan authored; branch `feat/etymolog-logograph` at `2110bf2`;
  baseline suite: GREEN (2280 tests, 110 files, 84s).

(Each phase appends: commit sha, deviations from plan, defects the audit caught.)

## §6 Pitfalls — READ BEFORE IMPLEMENTING (hard-won, most from prior etymolog epics)

1. **No package edits.** Everything lands in `apps/etymolog/`. If a change seems to need
   `cyber-components`/`smart-form`, find the app-local alternative and note it in §5. The
   worktree resolves `packages/*` by RELATIVE path aliases (vite/vitest/tsconfig) — but
   node_modules is an NTFS junction to the MAIN repo; never run a non-frozen
   `pnpm install` from the worktree.
2. **sql.js persistence**: NEVER call `persistDatabase()` (or anything that calls
   `Database.export()`) inside `withTransaction` — `export()` reopens the connection and
   drops pragmas. Only `exportDatabaseBytes()` may call export. Follow existing service
   patterns exactly; write through `updateLexicon`/`glyph_order`, never the junction
   tables directly.
3. **Migrations**: fresh (`createSchema`) and migrated DBs must be byte-identical in
   `sqlite_master` (modulo IF-NOT-EXISTS index names) — update BOTH paths and run
   `migrations.test.ts`. `PRAGMA foreign_keys` is a no-op inside a transaction — only
   set `foreignKeysOff: true` if you rebuild a table (Phase 5 shouldn't need it).
4. **DOMPurify data-URI default-deny** (Phase 2's core trap): the default
   `ALLOWED_URI_REGEXP` rejects `data:` — your `<image>` will be SILENTLY stripped and
   the glyph will save as an empty frame. Test the sanitizer output CONTAINS the image
   element. Never allow `data:image/svg+xml` (script vector). Hooks are global —
   idempotence test required.
5. **happy-dom has no canvas/Image/createImageBitmap and no IndexedDB.** Keep pixel math
   in pure functions over `{data,width,height}` arrays; inject the memory persistence
   adapter in tests; DB-touching tests need the `__ETYMOLOG_ALLOW_UNSANITIZED_SVG__`
   flag (test setup handles it) — but sanitizer tests must run WITH DOMPurify (happy-dom
   provides enough DOM for it; existing tests prove the pattern — grep first).
6. **SmartForm**: `registerField()` must be called EVERY render (caching → stale values).
   Composite inputs render their own `<input>`; programmatic values need the
   `setSmartFieldValue` DOM-write pattern with `markChanged:false` for prefills
   (StrictMode runs mount effects create→destroy→create while REFS survive — latch on
   the WRITE, not before it; see the `prefilledRef` comment in `LexiconFormFields`).
   A `{ success: false }` submit resolution must not latch the form (fixed upstream —
   don't reintroduce). Dirty-on-mount is a known bug class: after adding fields, load
   create AND edit pages and assert the NavigationGuard does NOT fire untouched
   (`LexiconEditorDirtyOnMount.test.tsx` shows how).
7. **Theming**: never hardcode colors; glyph ink is `currentColor` ONLY. For line-art
   imports verify visually in BOTH themes (dark theme via the app's theme toggle). A
   black-baked import is invisible on dark — that's the exact bug `normalizeGlyphSvg`
   exists for. `--interactive-text` and friends live in `index.css` and are RATCHETED by
   `src/styles/__tests__/tokens.test.ts` — new SCSS must use existing semantic tokens.
8. **StrictMode double-mount** (`main.tsx` wraps the app): any `useRef(true)` init latch
   falls through on the second mount-effect run. Use the shared `useEditedSinceMount`
   hook for edited-tracking.
9. **Charts read phonemes**: logogram graphemes have none. Verify the IPA chart,
   syllabary chart, custom charts, and the Writing System page handle phoneme-less
   graphemes (they likely just omit them — prove it with a test, don't assume).
10. **Respell service** (`respellService.ts`) rewrites auto-spelled words on
    phoneme/grapheme changes. Symbol words must be `auto_spell = 0`; words without
    pronunciation are already excluded — keep both invariants tested or a script edit
    will silently destroy hand-placed logogram spellings.
11. **Export size**: glyph SVGs ride inside JSON inside (optionally) a PNG codec.
    Raster imports fatten the DB — that's why the 512 px / 500 KB budget is enforced
    at IMPORT time, not at export.
12. **Windows/MSYS shell traps**: `git commit -m` with `//` in the message aborts in
    PowerShell — write the message to a scratchpad file and use `git commit -F`. A bare
    `cat > file` without heredoc in a Bash chain HANGS. `cat > file <<EOF` truncates
    first — combined with Vite's transform cache this once served an EMPTY CSS module;
    prefer the Write/Edit tools for source files, always.
13. **Vitest**: run from `apps/etymolog`. The suite is ~2280 tests / ~110 files and takes
    a few minutes on this machine — run targeted files while iterating
    (`npx vitest run <path>`), full suite at phase end.
14. **jsonCodec version gate** (`jsonCodec.ts:126`): after Phase 5a it must accept 1 AND
    2. Grep for OTHER version checks (pngFrame header, validateExport) before assuming
    there's only one.
15. **Do not rename/move existing files** unless the phase requires it — the suite pins
    many paths, and churn hides real diffs.
16. **`?folder=` param**: reuse the query-param reading pattern from
    `LexiconEditor`/generator (`useSearchParams`), and remember `activeTabId`/TAB_ROUTES
    derive nav state from the FIRST path segment — query params don't disturb it; do not
    add new path segments for folders.

## §7 Out of scope (goes to todo.md)

- Pronunciation beyond human anatomy (custom phoneme inventory symbols) — the free-text
  IPA field already accepts anything; a first-class custom-phoneme inventory is a
  separate epic.
- A dedicated "logograph-friendly mode" app setting that re-orders form sections.
- Folder drag-and-drop reordering (position column exists; UI ships click-to-move only).
- Mirror (kerbash.github.io) deploy + notifying the feedback author — human steps.

- **P1 2026-09-09** — `fe872e8`. Deviations: kept a non-required maxLength validator on
  pronunciation (dropping the validator entirely surfaced pre-existing React-Compiler
  lint errors in untouched code); submit gate is `hasNameSource` in the editor, not
  SmartForm `isSubmittable` (array fields seed `[]` = never "empty"). +21 tests.
  Seam for P3: a symbol-only word with no pronunciation AND no meaning is rejected —
  P3 must ensure a name source (symbol name default covers it) and route through
  `api.lexicon.create/update` (they own lemma derivation now).
- **P2 2026-09-09** — `c1684b2`. Deviation: DOMPurify 3.3.1 default KEEPS data: URIs on
  <image> (incl. the data:image/svg+xml script vector) — the plan's §6.4 premise was
  inverted; the hook force-keeps raster subtypes and strips everything else. Same
  security end-state. Line-art mode = luminance-mask PNG + currentColor rect. Edit-mode:
  glyphs whose svg_data contains <image> open in preview, not the drawer. +53 tests +
  coordinator fix: rasterToGlyphSvg.test.ts added to the token-ratchet allowlist
  (fixture literals are the codec's test INPUT). Suite 2354 green, tsc 0, eslint 0.
- **P1+P2 audit 2026-09-09** — 3 defects fixed: meaning-derived lemma now capped to
  LIMITS.LEMMA (was a hard 500-char failure the user couldn't act on); blank meaning
  rows dropped (were persisting and blanking the primary meaning column); <image href>
  on glyph SVGs now raster-data-URI-ONLY (external http(s) URLs previously survived
  sanitize = tracking-beacon vector via SVG file import). Suite 2366 green.

- **P3 2026-09-09** — Word-level symbols (UC-B1). NOT committed (per task instruction —
  left staged for the integrator). Files: NEW `src/db/wordSymbolService.ts`
  (`createWordSymbol`/`updateWordSymbolDrawing`, both ONE savepoint-nested transaction
  via the glyph+grapheme service creators; `wordSymbolGraphemeId` pure inference;
  `WORD_SYMBOL_CATEGORY='logogram'`), NEW `src/db/api/wordSymbolApi.ts` +
  `api.wordSymbol` wired through `db/api/index.ts`, `db/api/types.ts` (WordSymbolApi on
  EtymologApi) and the provider (`create`/`updateDrawing` = afterAll). `CreateLexiconInput.symbol`
  added; `lexiconApi.createLexicon` orchestrates symbol create + word insert in ONE
  `withTransaction` (full rollback proven by a forced FK failure) and forces
  `auto_spell=false`; symbol wins only with no explicit glyph_order. Form: `LexiconFormFields`
  gains a Compose/Word-symbol segmented control (edit-mode inference from a one-logogram
  glyph_order), reusing the Phase-2 import control + an inline SvgDrawerInput (GLYPH_INK,
  GLYPH_GUIDE_INSET); auto-spell forced off + disabled in Symbol mode; state reported up
  via `onSymbolStateChange`. `LexiconEditor` submits `symbol` on create, and on edit
  reuses/redraws (`api.wordSymbol.updateDrawing`) or mints (`api.wordSymbol.create`) the
  symbol grapheme.
  Deviations: (1) edit does NOT thread `symbol` through `UpdateLexiconInput` — per plan
  it uses `api.wordSymbol.updateDrawing` for an existing symbol and `api.wordSymbol.create`
  + a glyph_order rewrite when switching a word INTO Symbol mode (word row already exists,
  so no single-transaction need). (2) Symbol drawing is held in local state and reported
  up (like glyph_order), NOT read from formData; the registered `symbolSvg` field exists
  only to drive SvgDrawerInput. (3) Inference kept as two PRIMITIVE memos (id, svg) rather
  than one object so the report effect can't loop. (4) grapheme gallery category chip NOT
  added — `galleryGrapheme` does not group by category, so logogram graphemes are simply
  listed honestly (plan item 4's stated fallback). Downstream verified by test: phoneme-less
  logogram graphemes are absent from the chart phoneme map (no crash); a symbol word is not
  a respell candidate and survives a phoneme edit; deleting the word leaves the grapheme;
  deleting the grapheme via Script Maker runs `handleGraphemeDeletion`. +22 tests
  (`src/db/__tests__/wordSymbol.test.ts` 17, `.../lexicon/__tests__/LexiconSymbolMode.test.tsx` 5).
  Gates: tsc 0 app errors, eslint 0, full vitest green.

- **P5a 2026-09-09** — Nested folders, DATA LAYER only (UC-D; 5b UI deferred).
  NOT committed (per task instruction — left staged for the integrator). Files:
  migration v7 (`CURRENT_SCHEMA_VERSION = 7`) + `createSchema` kept in sync via
  two SHARED DDL helpers (`createLexiconFoldersTable` / `createLexiconFoldersIndex`
  in `migrations/schema.ts`), so `lexicon_folders` is byte-identical on both paths;
  `lexicon.folder_id` added inline-LAST in fresh and by `ALTER TABLE ADD COLUMN`
  in v7 (NULL default → no rebuild, no `foreignKeysOff`); v7 ends with
  `PRAGMA foreign_key_check`. NEW `src/db/folderService.ts` (create/rename/update/
  move/delete/getAll/getById/setLexiconFolder/getFolderPath/getDescendantFolderIds;
  `MAX_FOLDER_DEPTH = 12`; cycle guard walks the TARGET's parent chain; delete
  REPARENTS child folders + words to the deleted folder's parent in one txn and
  NEVER deletes a word) + NEW `src/db/api/folderApi.ts` (`api.folder`) wired through
  `db/api/index.ts`, `db/api/types.ts` (`EtymologApi.folder`) and the provider
  (`delete`/`setLexiconFolder` refresh the lexicon slice; create/rename/move pass
  through — no tracked slice reads folders until 5b). `folder_id` threaded through
  `Lexicon`/`CreateLexiconInput`/`UpdateLexiconInput`, `lexiconColumns`,
  `mapLexiconRecord`, and the lexicon insert/update. Export/import: `lexicon_folders`
  in `ExportTables`/`TABLE_INSERTION_ORDER` (before `lexicon`)/`AUTOINCREMENT_TABLES`/
  `ALL_TABLES_CHILDREN_FIRST`; `folder_id` rides on lexicon rows automatically
  (exporter reads `SELECT *`); `EXPORT_SCHEMA_VERSION = 2`; `jsonCodec` version gate
  now accepts 1..CURRENT and treats `lexicon_folders` as an optional (v1-absent)
  table; `validateExport` gained a `lexicon_folders` spec + `folder_id` on lexicon
  and a dangling-reference repair pass (nullable parent_id/folder_id can't use the
  non-null REFERENCES prune — a missing parent/folder is nulled + warned, not aborted).
  Deviations: (1) `Lexicon.folder_id` is OPTIONAL on the type (always present in the
  DB / `mapLexiconRecord`) — required would have forced an edit to a mock in
  `src/components/display/lexicon/__tests__/CompactLexiconDisplay.test.tsx`, which is
  off-limits this phase; an absent value means root. (2) The only envelope version
  gate is `jsonCodec.ts:126`; `pixelCodec`/`pngFrame` carry their OWN format versions
  (unrelated) and `validateExport` has none — confirmed by grep. +32 tests
  (`src/db/__tests__/folderService.test.ts` 27,
  `src/db/exportImport/__tests__/folderRoundTrip.test.ts` 5) plus migrations.test.ts
  gained fresh-vs-migrated structural equality + a populated-v6→v7 block.
  Gates: `npx vitest run src/db` 751 green, tsc 0 app errors, eslint 0.
  Seam for 5b: `api.folder.list()`/`getPath()` drive the gallery breadcrumb + tree
  picker; `lexiconComplete` already carries `folder_id`; the provider still needs a
  `folders` data slice (5b) so create/rename/move can refresh the tree — today they
  pass through. `LexiconFolder`/`Create*`/`Update*` types live in `db/types.ts`.
- **Final audit 2026-09-09** — 2 cross-phase defects fixed: (1) deleting a logogram
  grapheme left an auto_spell word WITHOUT pronunciation holding an unflagged,
  unrecoverable '?' spelling — now flagged needs_attention (narrow: respellable words
  stay unflagged); (2) a stale ?folder= deep link FK-crashed create/update — api now
  coerces a non-existent folder_id to root. +10 tests incl. the full feedback E2E
  (pronunciation-less symbol words in nested folder -> compound -> redrawn ancestor
  symbol -> export v2 -> wipe -> import). Suite 2467 green. Noted, not fixed: symbol
  mode-switch on edit can orphan a grapheme on retry (unreferenced only); corrupt-import
  folder cycles become invisible (guards prevent hangs).
- **P6 2026-09-09** — Browser smoke on a fresh conlang (alpha-etymolog launch config,
  port 5178) PASSED live: nested folder create (Nouns > Entities, ?folder= URL state,
  breadcrumb), New-word defaulting into the open folder, meaning-only word submittable
  (gate flips live), Symbol mode validation ("Draw or import a symbol") on empty submit,
  PNG import -> "line art, follows the theme" preview -> word created at /lexicon/db/1
  titled by its meaning, symbol rendered via mask+currentColor (ink = theme text color,
  verified white under dark), "no pronunciation yet" hint + Move-to-folder present.
  Only console errors were the intentional invalid submits. Note: SvgDrawer ignores
  synthetic pointer/mouse events (real-pointer only) — drawing not automatable via MCP,
  covered by unit tests instead. todo.md updated with human items; version bumped 0.4.0.
