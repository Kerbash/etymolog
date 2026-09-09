# Tree Explorer Epic — folders for words, graphemes AND glyphs, rendered as an inline collapsible tree

> **Contract for implementing agents.** Read this WHOLE file before touching code. Work ONLY in
> `D:/Coding/Javascript/greatest-Monorepo/.claude/worktrees/alpha` (branch `feat/etymolog-tree-explorer`).
> Use absolute paths in every shell command (`git -C <path>`, absolute file args) — the cwd resets
> between Bash calls. Stage by explicit path, NEVER `git add -A`. Never `rm -rf` anything under
> `.claude/worktrees/`. Never run a non-frozen `pnpm install`. Never run `pnpm ci:full`.
> Log every commit and every deviation in §5.

## §0 What the user asked for (2026-09-09)

1. Put **words, graphemes AND glyphs** into folders/subfolders, collapsible **inside the current
   data display** — like Apple's Finder list view: expand a folder in place and see the current
   directory AND its child directory at once, recursively.
2. The "directory" system is used by three concepts, so it should be a **reusable library piece**,
   not three copies.
3. The user floated "auto navigate into the child once it's too much" but delegated the decision.

**Decided design (do not relitigate):**
- **Cap-and-focus, NOT auto-navigate.** An expanded folder shows its child folders (further
  expandable) plus its first `TREE_ITEM_CAP = 12` items as a mini card grid, then a
  "Show all N →" row that FOCUSES the folder (it becomes the tree root; breadcrumb grows;
  `?folder=` updates). Collapsed by default; expansion is user action only. Nothing ever
  navigates by itself.
- **The generic tree component goes in `packages/cyber-components`** (`display/treeExplorer/`),
  NOT a new workspace package (a new package costs triple alias maintenance in etymolog —
  vite.config, vitest.config, tsconfig.app.json — for zero gain; cyber-components is already
  aliased). The etymolog-specific binding stays in-app.
- **Data model: three sibling folder tables** (`lexicon_folders` exists; add `glyph_folders`,
  `grapheme_folders` as exact structural clones) — NOT one table with a `domain` column, so FKs
  stay honest. One parameterized service engine drives all three.
- **Search always escapes to flat view** (already-shipped semantics). **Picker/selection modes
  are always flat** — no folder chrome.
- Indentation visually caps at depth 4 (offset stops growing; the breadcrumb carries depth).

## §1 Use cases

- **UC-1 Tree browsing (all 3 domains):** In the lexicon tab, the graphemes gallery, and the
  glyphs gallery, folder mode shows a breadcrumb + a collapsible tree. Expanding a folder inline
  reveals its subfolders and a capped grid of its items. "Show all" / breadcrumb focuses.
- **UC-2 Folder CRUD everywhere:** create subfolder, rename, move (cycle+depth guarded), delete
  (contents move up, NOTHING is deleted) — per domain, same dialogs.
- **UC-3 File items:** move a word/grapheme/glyph into a folder from its card/page; create-in-folder
  (`?folder=` carried into the create route sets `folder_id` on the new row).
- **UC-4 Persistence + deep links:** `?folder=<id>` = focused root (validated, unknown → root).
  Expanded-folder set persists per domain in localStorage (best-effort, corrupt-safe).
- **UC-5 Export/import:** folders + memberships for all three domains round-trip; v1/v2 exports
  still import (new tables empty / lexicon-only).
- **UC-6 Reuse:** the tree renderer is a generic cyber-components component with zero etymolog
  imports; the etymolog side binds all three galleries through ONE shared `DirectoryGallery`.

## §2 Verified current state (file:line facts — trust these, they were read this session)

**Etymolog data layer**
- `src/db/folderService.ts` (354 ln) — lexicon-only but ~90% generic. Table name is hardcoded in
  every SQL string; the ONLY item-coupling is the `UPDATE lexicon SET folder_id` reparent inside
  `deleteFolder` (:300) and `setLexiconFolder` (:313). `MAX_FOLDER_DEPTH = 12` (:40, root folder
  = depth 1). Pure helpers `depthOf`/`childrenIndex`/`subtreeHeight`/`descendantIds` (:98–:153)
  all carry visited guards. `moveFolder` cycle guard walks the TARGET's parent chain (:247);
  depth guard is `depthOf(newParent) + subtreeHeight(id) <= MAX` (:261). `deleteFolder` reparents
  child folders AND words to the deleted folder's parent in ONE `withTransaction` (:293–:306).
  Name via `validateStringLength(trimmed, LIMITS.FOLDER_NAME, …)` (:164).
- `src/db/api/folderApi.ts` (231 ln) — `FolderApi` = list/getById/create/update/rename/move/
  delete/setLexiconFolder/getPath. **Error mapping STRING-SNIFFS the service's messages**
  (`fromError` matches `'not found'`, `'cannot exceed'`, `'into itself'`, `'own descendant'`,
  `'needs a name'`). Change a message text and the mapping silently degrades.
- Migration: `CURRENT_SCHEMA_VERSION = 7` (`src/db/migrations/version.ts:11`).
  `schema.ts:290` `createLexiconFoldersTable()` — `id PK, name NOT NULL, parent_id NULL REFERENCES
  lexicon_folders(id) ON DELETE CASCADE, position DEFAULT 0, created_at, updated_at`; parent index
  :304. `lexicon.folder_id … ON DELETE SET NULL` (:146) + `idx_lexicon_folder` (:165). The folders
  table is created BEFORE `lexicon` in fresh schema (FK order). v7 entry: `migrations/index.ts:359`
  reuses the same DDL fns, then `ALTER TABLE lexicon ADD COLUMN`, index, then
  `foreignKeyViolationCount()` assert.
- Types `src/db/types.ts:292` — `LexiconFolder { id, name, parent_id, position, created_at,
  updated_at }` + Create/Update inputs (Update has NO parent_id; moving is a separate op).
- Glyph/grapheme schema: `glyphs` (schema.ts:33) `id, name, svg_data, category, notes, timestamps`;
  `graphemes` (:52) `id, name, category, notes, timestamps`. NO folder columns. `category` is
  flat free-text used ONLY for `WORD_SYMBOL_CATEGORY = 'logogram'` (`wordSymbolService.ts:36`) —
  do not touch it.
- Context `src/db/context/etymologContext.ts` — `EtymologData` has `folders: LexiconFolder[]`;
  **`RefreshError.slice` is a CLOSED union** `'glyphs'|'graphemes'|'lexicon'|'folders'` (:33);
  refreshers `refreshGlyphs/refreshGraphemes/refreshLexicon/refreshFolders`; `batchMutations`
  coalesces per-slice refreshes (re-entrant, flushes on throw). `EMPTY_DATA` mirrors the shape.
- Export: `src/db/exportImport/` — `EXPORT_SCHEMA_VERSION = 2` (types.ts / config/version.ts);
  jsonCodec accepts versions 1..CURRENT; `lexiconApi.ts` has `resolveExistingFolderId()` (coerces
  a stale folder_id to root) — the pattern to copy for import validation.

**Etymolog UI**
- `src/components/tabs/lexicon/folders/` — `FolderBrowser.tsx` (234 ln, breadcrumb + one-level
  child rows + CRUD, props `{folders, currentFolderId, onNavigate, lexicons}` — the `lexicons`
  prop only computes a per-folder direct-count Map, trivially generalizable to a `counts` prop);
  `FolderNameDialog` (create/rename modal); `FolderTreeSelect` (native `<select>`, indent labels);
  `MoveToFolderDialog` (mounts inner form only while open, so state seeds without effects);
  `folderTree.ts` (104 ln pure helpers: `indexFolders`, `childFolders` sorted position→name→id,
  `folderPath`, `buildFolderOptions` with depth + excludeId-drops-subtree; EVERY walk has a
  visited guard); `createHref.ts` (`lexiconCreateHref(folderId)` → `/lexicon/create?folder=N`).
  Only `folderTree.ts` has tests.
- `src/components/tabs/lexicon/galleryLexicon/LexiconGallery.tsx` (323 ln) — owns `?folder=`
  (validated :126–:131), `navigateToFolder` via `setSearchParams`, `flatView = selectionMode ||
  allWords || searchActive` (:148), filters items by `(folder_id ?? null) === currentFolderId`.
  Renders toggle row → `<FolderBrowser>` (when !flatView) → `<EntityGallery>`; picker mode
  returns the bare gallery.
- `src/components/shared/gallery/EntityGallery.tsx` (316 ln) — the app's ONE gallery, wraps cyber
  `DataGallery`. **Activation lives on the CARD (`EntityCard` Link/button), NEVER also on
  DataGallery's `onItemActivate` — wiring both fires twice per click.** Two empty states
  (never-had vs no-match; no-match ALWAYS appends Clear-filters).
- `src/components/shared/gallery/useGalleryState.ts` (220 ln) — `GalleryState` is flat+serializable
  by design; **`applyGallery` derives the clamped page and NEVER writes it back — no setState
  during render, ever**; every result-set-changing setter resets page to 1. No persistence today.
- Other galleries: `grapheme/galleryGrapheme/graphemeGallery.tsx` (168 ln, data
  `graphemesComplete`, delete via `useGraphemeDelete()` two-stage flow);
  `grapheme/galleryGlyphs/galleryGlyphs.tsx` (195 ln, data `glyphsWithUsage`, delete via
  `api.glyph.cascadeDelete`, `showViewToggle={false}`, `minItemWidth="160px"`, toolbar
  `Auto-manage` switch in `toolbarEndSlot`).
- Routing: nested `<Routes>` (no data router). Lexicon: `tabs/lexicon/main.tsx`. Script-maker:
  `tabs/grapheme/main.tsx` — graphemes at index, glyphs under `glyphs/*` — DIFFERENT paths, so a
  `?folder=` param per page cannot collide. Query params are ad-hoc `useSearchParams` per page.
- Routes/urls: `src/url_mapping.ts` `ROUTES` + `resolveUrl()` — never hardcode a path.

**cyber-components**
- `display/dataGallery/` (~2038 ln total) — flat grid + toolbar + pagination + virtualization +
  ONE level of flat string-category grouping (`groupBy: (item)=>string`, collapsible headers with
  correct aria). NO recursion. **Do not modify it in this epic.**
- `container/expandableContainer` — has `showTree?: boolean // Future feature` (unimplemented) and
  an a11y defect (toggle is `role="button"` div WITHOUT `aria-expanded`). **Do not reuse or fix it
  here; build TreeExplorer fresh with correct semantics. Leave expandableContainer untouched.**
- The package is SOURCE-ONLY (no build; consumers deep-import `.tsx` paths) and is consumed by
  nochi/taxonia/etymolog. It has its own `vitest.config.mts` and `"test": "vitest run"`.
  It lists `next` as a peer dep and `react-router-dom` as an OPTIONAL peer —
  **TreeExplorer must import NEITHER** (framework-agnostic: links/routing arrive via render props).
- Etymolog consumes it through explicit vite/vitest/tsconfig aliases pointing at the WORKTREE's
  `../../packages/cyber-components` — so worktree edits to the package ARE seen by etymolog's
  dev server and tests. No alias changes needed for this epic.

## §3 Phases

### Phase 1 — Folder domain engine + migration v8 + export v3 (data layer only, zero UI)

1. **`src/db/folderDomain.ts` (new):** `createFolderDomain(config)` where
   `config = { folderTable: string; itemTable: string; itemFolderColumn: string; label: string }`
   (label = 'Folder' for messages). Port folderService.ts's ENTIRE body verbatim with the three
   coupling points parameterized: SQL table names, the item reparent in `deleteFolder`, and
   `setItemFolder(itemId, folderId|null)` (generalizes `setLexiconFolder`; item-existence check
   against `itemTable`). Keep EVERY error-message substring byte-identical
   (`'not found'`, `'cannot exceed'`, `'into itself'`, `'own descendant'`, `'needs a name'`) —
   folderApi's `fromError` string-sniffs them. Table/column names come only from the three
   hardcoded config literals below (never user input), so template interpolation is safe — still
   keep VALUES parameterized with `?` as today.
2. **Instances:** export `lexiconFolderDomain`, `glyphFolderDomain`, `graphemeFolderDomain` from
   a small registry (`src/db/folderDomains.ts` or in folderDomain.ts). Rewrite
   `folderService.ts` as thin delegating re-exports of the lexicon instance so every existing
   import and test keeps working unchanged (`createFolder = lexiconFolderDomain.createFolder`
   etc., `setLexiconFolder = …setItemFolder`). `MAX_FOLDER_DEPTH` stays exported from its
   current home.
3. **Types:** add `FolderRecord` (same shape as `LexiconFolder`) + `CreateFolderInput` /
   `UpdateFolderInput`; make `LexiconFolder = FolderRecord` a type alias (structural — nothing
   breaks). Context slices for the new domains use `FolderRecord`.
4. **Migration v8:** in `schema.ts` add `createGlyphFoldersTable()` / `createGraphemeFoldersTable()`
   (+ parent indexes) as byte-pattern clones of the lexicon ones, add `folder_id INTEGER NULL
   REFERENCES <domain>_folders(id) ON DELETE SET NULL` to `glyphs` and `graphemes` + indexes.
   **FK ordering in FRESH schema: the folder tables MUST be created BEFORE `glyphs`/`graphemes`**
   (mirror how `lexicon_folders` precedes `lexicon`). In `migrations/index.ts` add the v8 entry
   reusing the SAME DDL functions, `ALTER TABLE … ADD COLUMN`, indexes, then the
   `foreignKeyViolationCount()` assert (copy the v7 entry's shape at :359 exactly). Bump
   `CURRENT_SCHEMA_VERSION` to 8. The existing fresh-vs-migrated parity test must stay green.
5. **API:** add `glyphFolder` and `graphemeFolder` api namespaces with the SAME `FolderApi`
   surface (generalize the factory in folderApi.ts — `createFolderApi(domain)` — and make the
   existing `api.folder` the lexicon instance; keep the `setLexiconFolder` method name on
   `api.folder` for back-compat and give all three a `setItemFolder`). Extend the create paths:
   `createGlyph` / `createGrapheme` service+api inputs get optional `folder_id` (validate the
   folder exists; invalid → throw, EXCEPT import paths which coerce like
   `resolveExistingFolderId`). Word-symbol auto-created glyph+grapheme land at ROOT (decided).
6. **Context:** `EtymologData` gains `glyphFolders: FolderRecord[]`, `graphemeFolders:
   FolderRecord[]`; extend the CLOSED `RefreshError.slice` union + `EMPTY_DATA` + refreshers
   (`refreshGlyphFolders`, `refreshGraphemeFolders`) + `batchMutations` slice keys, mirroring the
   `folders` slice wiring in `EtymologProvider.tsx` exactly.
7. **Export v3:** `EXPORT_SCHEMA_VERSION = 3`; envelope carries `glyph_folders`,
   `grapheme_folders`, and the two new `folder_id` columns; importer accepts 1..3 (v1/v2 → new
   tables empty); import validation coerces a dangling `folder_id` to null (per-domain
   `resolveExistingFolderId` equivalents). Update `validateExport.ts` accordingly.
8. **Tests (this phase's gate):** parameterize the existing folder-service test suite to run
   against ALL THREE domains (one describe.each over the domain configs — reparenting delete,
   cycle guard, depth cap incl. subtree-height moves, rename validation); migration v8
   fresh==migrated parity; export v3 round-trip + v2-import back-compat + dangling-folder_id
   coercion; create-with-folder_id for glyph/grapheme.

**Gate:** full etymolog suite green (`pnpm test` in the worktree's `apps/etymolog`, i.e.
`vitest run`), `npx tsc --noEmit` no NEW errors vs baseline, eslint clean on touched files.
Commit `(etymolog): folder domain engine, glyph/grapheme folders (migration v8), export v3`.

### Phase 2 — `TreeExplorer` in cyber-components (generic, additive-only)

New directory `packages/cyber-components/display/treeExplorer/` ONLY (+ one appended entry in
`COMPONENT_DIRECTORY.md`). No other package file may change.

1. **`types.ts`:** `TreeExplorerNode = { id: string|number; parentId: string|number|null }` is the
   minimum input contract — the component takes a FLAT `nodes: readonly T[]` (T extends
   TreeExplorerNode) plus an optional `compareNodes(a,b)` and builds the forest internally with
   visited-set cycle guards (a node whose parent is missing or cyclic renders at ROOT — never
   dropped, never an infinite loop; this mirrors etymolog's corrupt-import stance).
2. **`useTreeState.ts` (headless, exported):** expandedIds as `ReadonlySet<string|number>`,
   controlled (`expandedIds` + `onExpandedChange`) OR uncontrolled (`defaultExpandedIds`) —
   follow DataGallery's `collapsedCategories`/`onCategoryToggle` precedent for the dual mode.
   API: `isExpanded(id)`, `toggle(id)`, `expand/collapse(id)`, `collapseAll()`.
3. **`TreeExplorer.tsx`:** recursive renderer. Per node renders a HEADER ROW (a real `<button>`
   with `aria-expanded`, chevron, then caller content via `renderNodeHeader(node, ctx)` where
   `ctx = { level, isExpanded, toggle, childCount }`) and, when expanded, a CONTENT region:
   first the node's child tree items (recursion), then `renderNodeContent(node, ctx)` for
   caller payload (etymolog's capped card grid). A `renderEmptyNode?` for a leaf with no content.
   Optional `endSlot(node, ctx)` for per-row actions (CRUD menu) rendered OUTSIDE the toggle
   button (a button inside a button is invalid HTML — the row is a flex div containing
   [toggle-button][endSlot]).
4. **A11y model — disclosure pattern, NOT aria tree.** Because expanded content embeds arbitrary
   interactive grids, a strict `role="tree"` (which owns all Arrow-key focus) would fight the
   cards. Use nested lists (`<ul role="list">`) + disclosure buttons with `aria-expanded` +
   `aria-controls`; keyboard = normal tab flow plus ArrowLeft (collapse focused row /
   move to parent row) and ArrowRight (expand / into first child row) on the header buttons as
   progressive enhancement. Document this choice in the component header comment.
5. **Indent:** CSS `--tree-explorer-indent` per level, VISUALLY CAPPED at level 4
   (`min(level, 4)`), with a continuous guide line so deeper levels still read as nested. All
   colors via CSS variables (semantic tokens) — zero literals.
6. **Theming/conventions:** follow `guideline/COMPONENT_GUIDELINE.md` (parts/styling API,
   themeType) the way dataGallery does — a `styling`/`parts` prop for class hooks is enough; no
   translationMap needed (component renders no copy of its own beyond the chevron aria-labels,
   which must be overridable props).
7. **Tests:** `display/treeExplorer/__tests__/` run by the PACKAGE's own vitest
   (`pnpm test` inside `packages/cyber-components` — record the baseline pass/fail state BEFORE
   your changes; pre-existing failures are not yours to fix, new ones are). Cover: forest build
   from flat list, orphan→root, cycle→root+terminates, controlled vs uncontrolled expansion,
   aria-expanded/aria-controls wiring, indent cap, endSlot not nested in the button.

**Gate:** cyber-components suite (no new failures vs recorded baseline) + etymolog suite still
green + tsc/eslint. Commit `(cyber-components): TreeExplorer — generic collapsible directory tree`.

### Phase 3 — `DirectoryGallery` + lexicon converts to tree mode

1. **`src/components/shared/directory/DirectoryGallery.tsx` (new, in etymolog):** the ONE binding
   used by all three domains. Props (generic over item T): everything EntityGallery needs
   (items, state, adapters, keyExtractor, renderItem, itemLabel, itemHref, renderActions,
   selectionMode/onSelect, empty/noMatch, ariaLabel, isReady, error, sortOptions, filterOptions…)
   PLUS `folders: readonly FolderRecord[]`, `getItemFolderId(item)`, `folderApi: FolderApi`,
   `refreshFolders()`, `domainKey: 'lexicon'|'glyph'|'grapheme'` (drives the localStorage key +
   copy), `createHref?(folderId)`, `onMoveItem?(item, folderId)`.
   Behavior:
   - `flatView = selectionMode || allItems || searchActive` → render plain `EntityGallery`
     exactly as today (pagination and all).
   - Tree mode: breadcrumb (focus trail from `?folder=`, reuse `folderPath`) + `TreeExplorer`
     over the folders whose subtree is under the focused root, with per-node header =
     name + direct item count + CRUD `endSlot` (new subfolder / rename / move / delete — reuse
     `FolderNameDialog` + `MoveToFolderDialog`, generalized to `FolderRecord` + a `FolderApi`
     prop), and `renderNodeContent` = the folder's items sorted by the CURRENT sort adapter,
     capped at `TREE_ITEM_CAP = 12`, rendered as the same `EntityCard` grid (compact/detailed
     honored), followed by a "Show all N →" focus row when over the cap. The FOCUSED folder's
     own items render as a grid ABOVE the child tree (that is "the current directory's
     content"). No pagination in tree mode — caps replace it.
   - Expansion state: localStorage `etymolog.treeExpansion.<domainKey>`, every read/write in
     try/catch, parse-validate to an id array, corrupt/missing → empty set; prune ids that no
     longer exist in the slice before use.
   - `?folder=` handling moves INTO DirectoryGallery (one copy): parse, validate against the
     slice (unknown/non-numeric → root), navigate via `setSearchParams` — byte-for-byte the
     LexiconGallery semantics.
2. **Generalize the folder dialogs/pickers** (`FolderNameDialog`, `MoveToFolderDialog`,
   `FolderTreeSelect`, `folderTree.ts` helpers) from `LexiconFolder` to `FolderRecord` and move
   them to `shared/directory/` (leave re-export shims at the old `tabs/lexicon/folders` paths so
   nothing else churns; `folderTree.test.ts` keeps passing untouched).
3. **LexiconGallery converts:** drop its inline folder plumbing + `FolderBrowser` usage and render
   `DirectoryGallery` with its existing adapters/renderers. The "All words" toggle, picker
   flatness, empty-state folder-aware copy, and `lexiconCreateHref` carry over. `FolderBrowser.tsx`
   is deleted (its breadcrumb + CRUD live on in DirectoryGallery); update/port its tests.
4. **Move-to-folder on the word card/page** stays wired as before (api unchanged).
5. **Tests:** DirectoryGallery unit tests (flat↔tree switching, cap + Show-all focus, `?folder=`
   validation, localStorage corruption, expansion pruning, CRUD dialog round-trips with the
   lexicon domain) + keep every pre-existing lexicon folder test green (shims!).

**Gate:** full etymolog suite + tsc + eslint. Commit
`(etymolog): DirectoryGallery — inline folder tree for the lexicon`.

### Phase 4 — Glyph + grapheme rollout

1. `graphemeGallery.tsx` and `galleryGlyphs.tsx` convert to `DirectoryGallery` with their existing
   adapters/renderers/actions (`domainKey` 'grapheme' / 'glyph'; grapheme keeps its
   `useGraphemeDelete` flow; glyphs keep `showViewToggle={false}`, `minItemWidth="160px"`, and the
   Auto-manage `toolbarEndSlot`). Their pages read/write their own `?folder=` (different routes —
   no collision).
2. Create-in-folder: the glyph and grapheme CREATE routes read `?folder=` (validated) and pass
   `folder_id` through the create call; the galleries' empty-state/create CTAs use per-domain
   `createHref(folderId)` helpers alongside `lexiconCreateHref`.
3. Move-to-folder action per card (`renderActions` gains a "Move to folder" affordance opening
   `MoveToFolderDialog`) for BOTH domains, and for lexicon too if it only had it on the page.
4. Picker surfaces (GlyphPickerModal, ancestor picker) remain flat — assert via tests.
5. **Tests:** per-domain integration (filed item appears only in its folder in tree mode; search
   escapes; delete-folder reparents glyphs/graphemes; create-in-folder lands correctly;
   word-symbol auto-created glyph/grapheme land at root).

**Gate:** full etymolog suite + tsc + eslint. Commit
`(etymolog): folder trees for glyphs and graphemes`.

### Phase 5 — Cross-cutting audit, comprehensive tests, smoke, release prep

1. **Adversarial audit** (fresh agent, reads the whole diff `git -C <worktree> diff master...HEAD`):
   hunt for cross-phase seams — expansion-state pruning vs refresh timing, batchMutations slice
   coverage for the new domains, export/import edge cases, double-activation regressions, the
   string-sniffed error mapping, orphaned-folder rendering. Fix what's real; log the rest in §5.
2. **Comprehensive test additions:** 12-deep tree render + interaction; localStorage poison;
   controlled/uncontrolled TreeExplorer parity; full three-domain export→wipe→import→tree-state
   scenario; keyboard (tab flow + arrow enhancements).
3. **Full gates:** etymolog suite, cyber-components suite (vs baseline), `tsc --noEmit`, eslint.
4. **Browser smoke** (preview tool, `alpha-etymolog` launch config, port 5178 — verify the config
   still exists in MAIN's `.claude/launch.json`; recreate if missing): build a small nested tree
   in each of the three tabs, expand/collapse, Show-all focus, deep-link `?folder=`, create-in-
   folder, move, delete-reparents, dark mode glance. Screenshot proof.
5. **Docs + version:** update `apps/etymolog/README.md` (DirectoryGallery + TreeExplorer sections),
   bump etymolog `package.json` minor (0.4.0 → 0.5.0), rebuild the static docs site the way the
   logograph release commit did, append human items to `apps/etymolog/todo.md`.
6. Merge into master from the MAIN tree with `--no-ff` (the post-merge LITE gate fires itself —
   run NOTHING extra).

## §4 Gates (every phase)

- `pnpm test` (vitest run) in `<worktree>/apps/etymolog` — ALL green; from Phase 2 on, also
  `pnpm test` in `<worktree>/packages/cyber-components` — no NEW failures vs the baseline recorded
  in §5.
- `npx tsc --noEmit` in `apps/etymolog` — no NEW errors vs baseline (the repo convention is
  stash-diff per (file, TS-code), never absolute counts).
- eslint clean on every touched file.
- The etymolog color-token ratchet (`src/styles/__tests__/tokens.test.ts`) — if a TEST FIXTURE
  legitimately needs a color literal, use the documented allowlist, never weaken the ratchet.

## §5 Execution log (append-only: commits, baselines, deviations, deferred findings)

- 2026-09-09: branch `feat/etymolog-tree-explorer` cut from master `09be98a`. Plan authored (`c610555`).
- 2026-09-09: **Baselines** — cyber-components suite GREEN: 41 files / 536 tests (vitest 4.1.3, 7.6s). etymolog suite GREEN at branch point: 2467 tests (logograph epic final gate); tsc 0 app-file errors.
- 2026-09-09: **Phase 1 COMPLETE — commit `74ec0e9`** `(etymolog): folder domain engine, glyph/grapheme folders (migration v8), export v3`.
  - **Gates:** `npx tsc --noEmit` → 0 errors (baseline 0). Full etymolog `vitest run` → **128 files / 2535 tests, all green** (up from 2467 at branch point; +68 from the new suites). eslint clean on all touched files.
  - **What shipped (all of Phase 1 items 1–8):** `folderDomain.ts` (`createFolderDomain` engine + `lexiconFolderDomain`/`glyphFolderDomain`/`graphemeFolderDomain` — the registry lives IN `folderDomain.ts`, per the plan's "or in folderDomain.ts" option, not a separate `folderDomains.ts`). `folderService.ts` rewritten as thin re-exports of the lexicon instance (the five error substrings kept byte-identical). Types: `FolderRecord` + `CreateFolderInput`/`UpdateFolderInput`, `LexiconFolder`/`Create*`/`Update*` now aliases; `Glyph`/`Grapheme` + their create inputs gained optional `folder_id`. Migration v8 (`glyph_folders` + `grapheme_folders` + `glyphs.folder_id`/`graphemes.folder_id`, ON DELETE SET NULL) in both `schema.ts` (folder tables BEFORE their item tables; `folder_id` declared LAST) and `migrations/index.ts` (v8 entry mirrors v7 incl. the `foreignKeyViolationCount` assert); `CURRENT_SCHEMA_VERSION` → 8; fresh-vs-migrated parity test green. API: `createFolderApi(domain)` factory; `api.folder` is the lexicon instance (keeps `setLexiconFolder`), added `api.glyphFolder` + `api.graphemeFolder` with `setItemFolder`; `createGlyph`/`createGrapheme` (service + api) take optional `folder_id` (API validates → `VALIDATION_ERROR`; import coerces). Context: `glyphFolders`/`graphemeFolders` slices wired through the closed `RefreshError` union, `EMPTY_DATA`, `SLICE_ORDER`, refreshers, `requestRefresh`, `batchMutations` flush, and the provider's wrapped-API namespaces. Export v3: `EXPORT_SCHEMA_VERSION` → 3; envelope carries both new folder tables + `folder_id` columns; importer accepts 1..3; dangling `folder_id`/`parent_id` coerced to root in `validateExport.ts` (generalised over all three domains). Word-symbol auto-created glyph+grapheme stay at ROOT (comment added in `wordSymbolService.ts`).
  - **Deviations / notes:**
    1. **`folderService.test.ts` left UNCHANGED**; instead added a NEW `folderDomain.test.ts` with `describe.each` over all three domains (engine-level cycle/depth/reparent/setItemFolder/path + a domain-isolation case). Rationale: the existing suite doubles as the re-export-shim + folderApi-envelope regression test (pitfall 17), so keeping it intact AND adding a parameterized engine suite is strictly stronger than mutating it in place. Intent of item 8 ("describe.each over the domain configs") is fully met.
    2. **`setItemFolder` not-found message generalised** to `Item with id <id> not found` (was `Lexicon entry with id <id> not found`). Still contains the `not found` substring `fromError` sniffs; no test asserted the exact text.
    3. **`database.ts` `ALL_TABLES_CHILDREN_FIRST`** gained `grapheme_folders` (after `graphemes`) and `glyph_folders` (after `glyphs`) — not spelled out in the plan but REQUIRED: without it `clearAllTables`/`clearDatabase`/import-wipe leave folder rows behind (caught by the new v2/v3 import tests).
    4. **Pre-existing tests with hardcoded literals updated** for the version bumps: `config/__tests__/version.test.ts` (`EXPORT_SCHEMA_VERSION` 2→3), `db/__tests__/audit-logograph-final.test.ts` (now asserts against the imported constant), `migrations.test.ts` (`CURRENT_SCHEMA_VERSION` 7→8, applied arrays, shape/column checks, new v8 describe block), `folderRoundTrip.test.ts` (2→3).
  - New test files: `db/__tests__/folderDomain.test.ts`, `db/exportImport/__tests__/glyphGraphemeFolders.test.ts` (create-with-folder_id + reject-dangling + word-symbol-at-root + export v3 round-trip + v2 back-compat + dangling coercion).
- 2026-09-09: **Phase 1 ADVERSARIAL AUDIT — 1 real defect found + fixed (commit pending).**
  - **Areas audited clean:** migration parity (fresh CREATE declares `folder_id` LAST, matching sql.js `ALTER … ADD COLUMN` append; `foreignKeyViolationCount` assert present in v8 — note the parity `schemaFingerprint` SORTS columns by name so it is insensitive to column ORDER, but the code is correct regardless); engine byte-for-byte parity vs original `folderService` (transaction boundaries, `getRowsModified`, `updated_at` stamping, depth/cycle visited guards, the five `fromError` substrings all preserved; SQL table/column names come ONLY from the three hardcoded config literals — no dynamic `createFolderDomain` call site; the `setItemFolder` not-found message change stays within the `not found` sniff); create-with-folder_id validated against the RIGHT domain table, word-symbol path passes no `folder_id`; context slices `glyphFolders`/`graphemeFolders` fully wired through the closed `RefreshError` union, `EMPTY_DATA`, `SLICE_ORDER`, `requestRefresh`, `batchMutations`, and the wrapped-api after-hooks symmetrically (glyphFolder→glyphs, graphemeFolder→graphemes on delete/setItemFolder); wipe/drop order (`ALL_TABLES_CHILDREN_FIRST`) and export `TABLE_INSERTION_ORDER` both put each item table before its folder table; v2 import leaves new tables empty; dangling `folder_id`/`parent_id` coerced to root (all three domains via `coerceFolderDomain`).
  - **DEFECT (all three folder domains, also pre-existing for lexicon v7): export→import of a MOVED folder aborted the whole restore.** A folder moved under a later-created folder ends up with a lower id than its parent; export reads rows in id (rowid) order, so the child row is written before its parent; the import inserted with `foreign_keys` ON, so the child INSERT hit `FOREIGN KEY constraint failed` and rolled back the entire (otherwise valid) import — an unrestorable backup. `move` is a first-class UC-2 op, so fully reachable; the shipped round-trip tests only seeded parent-before-child by id, so it slipped through. **Fix:** `PRAGMA defer_foreign_keys = ON` at the top of the import transaction in `exportImport/jsonCodec.ts::importExportData`, so the existing end-of-transaction `countForeignKeyViolations()` scan (a genuine dangling ref still rolls back) is the sole integrity gate; a corrupt cyclic parent chain now imports intact (all rows exist → check passes) to be tamed by the render-time visited guards, matching the app's corrupt-cycle stance. Regression tests added to `glyphGraphemeFolders.test.ts` (moved-folder round-trip preserving the parent chain + item membership for lexicon/glyph/grapheme). Gates: full etymolog suite 128 files / 2538 tests green (+3), `tsc --noEmit` 0, eslint clean on touched files. Commit `(etymolog): P1 audit fix — defer FK enforcement on import so a moved folder's export round-trips`.

- 2026-09-09: **Phase 2 COMPLETE — commit `514c544`** `(cyber-components): TreeExplorer — generic collapsible directory tree`.
  - **Baselines re-confirmed BEFORE editing:** cyber-components suite GREEN 41 files / 536 tests (vitest 4.1.3). etymolog suite GREEN 128 files / 2538 tests. etymolog `tsc --noEmit` 0 errors.
  - **Gates (after):** cyber-components `pnpm test` → **42 files / 554 tests, all green** (+1 file, +18 tests; zero pre-existing failures, none new). etymolog `pnpm test` → **128 files / 2538 tests, all green** (unchanged — TreeExplorer is not imported by the app until Phase 3). etymolog `tsc --noEmit` → 0 errors. `tsc` on the cyber-components package shows only the PRE-EXISTING `display/infiniteScrollList/infiniteScrollList.tsx` errors (unrelated); zero errors mention `treeExplorer`. eslint (etymolog flat config, run from the worktree root so the package falls in base path) → **0 problems** on all six new files incl. the test.
  - **What shipped (all of Phase 2 items 1–9), additive-only under `packages/cyber-components/display/treeExplorer/`:**
    - `types.ts` — `TreeExplorerNode = { id: string|number; parentId: string|number|null }`, `TreeNodeId`, `TreeNodeContext = { level, isExpanded, toggle, childCount }`, `TreeNodeLabel<T>`, `TreeExplorerStylingProps` (parts: root/list/item/row/toggleButton/chevron/headerContent/endSlot/content), `TreeExplorerProps<T>`.
    - `buildForest.ts` — pure `buildForest(nodes, compareNodes?)`; visited-set guards; orphan (missing/`undefined`/self parent) → root; pure cycle (A→B→A) promoted to root and terminates; duplicate ids collapse (last-wins in id map, materialised once); siblings sorted by `compareNodes` when supplied. Exported for consumers/tests.
    - `useTreeState.ts` — headless dual-mode hook (`isExpanded`/`toggle`/`expand`/`collapse`/`collapseAll`); controlled via `expandedIds`+`onExpandedChange`, uncontrolled via `defaultExpandedIds`; mirrors DataGallery's controlled/uncontrolled precedent. `onExpandedChange(next: ReadonlySet)` (see deviation 1).
    - `TreeExplorer.tsx` — recursive disclosure renderer; header row = flex `[<button aria-expanded aria-controls>chevron+renderNodeHeader][endSlot]`, endSlot OUTSIDE the button; expanded content region = child `<ul role="list">` recursion THEN `renderNodeContent`, `renderEmptyNode` leaf fallback; ArrowLeft/ArrowRight progressive enhancement (DOM-traversal focus move via `data-tree-row`/`data-tree-content`); a11y rationale documented in the file header. A childless node with no content renderer is a non-interactive `<div>` (no bogus `aria-expanded`).
    - `treeExplorer.module.scss` — per-level indent STEP on the content region (`--tree-explorer-step` 1 under cap / 0 past, × `--tree-explorer-indent`), continuous guide line (`border-inline-start`) on every content region; zero colour literals (semantic tokens only).
    - `index.ts` barrel — component (default + named), `useTreeState`, `buildForest`, all types.
    - `__tests__/treeExplorer.test.tsx` — 18 tests (happy-dom, createRoot+act harness matching `dataGallery.test.tsx`): forest build, orphan→root, self-parent→root, cycle→root+terminates, dup-id collapse, `compareNodes` order, disclosure semantics (no `role=tree`), aria-expanded/aria-controls wiring, overridable expand/collapse labels, endSlot-outside-button, uncontrolled toggle, controlled defers to `onExpandedChange`, ArrowRight/ArrowLeft expand+collapse+focus-move, indent cap (`--tree-explorer-step`), leaf non-expandable + `renderEmptyNode`.
    - `COMPONENT_DIRECTORY.md` — one TOC line under Display + one detailed `### treeExplorer` entry (the ONLY package file touched outside the new dir).
  - **Deviations / notes:**
    1. **`onExpandedChange(next: ReadonlySet<TreeNodeId>)`** carries the whole next set rather than DataGallery's per-item `(category, isCollapsed)` — a set-valued callback is the correct controlled contract for `collapseAll` (which has no single id) and keeps the parent's state the single source of truth. Intent of "controlled (`expandedIds` + `onExpandedChange`)" fully met.
    2. **Indentation model is a per-level STEP on the content region, not absolute row padding.** Absolute per-row padding would compound through nesting; the step model makes the `min(level, cap)` cap and the continuous guide line both fall out naturally (each nested content adds one step while under the cap, 0 past it; the guide border draws at every depth). The observable contract ("indent visually capped at level 4, continuous guide for deeper nesting") is met; the test asserts the `--tree-explorer-step` var flips to 0 at/after the cap.
    3. **`buildForest` is a separately-exported pure function** (not inlined in the component) so the forest transform is unit-testable and reusable; exported from the barrel.
    4. No `translationMap` (the component renders no copy of its own beyond the chevron aria-labels, which are the overridable `expandLabel`/`collapseLabel` props) and no `theme.ts` (no motion variants) — both consistent with the guideline's "only when the component has user-facing text / animation variants".

- 2026-09-09: **Phase 3 COMPLETE — commit `ee1015e`** `(etymolog): DirectoryGallery — inline folder tree for the lexicon`.
  - **Baselines re-confirmed BEFORE editing:** etymolog suite GREEN 128 files / 2538 tests; etymolog `tsc --noEmit` 0 errors; cyber-components GREEN 42 files / 554 tests.
  - **Gates (after):** etymolog `vitest run` → **130 files / 2557 tests, all green** (+2 files, +19 tests — the two new DirectoryGallery suites; `LexiconFolders.test.tsx` count unchanged at 14, `folderTree.test.ts` unchanged at 7). `tsc --noEmit` → 0 errors. eslint → clean on all touched files. Color-token ratchet (`styles/__tests__/tokens.test.ts`) green. cyber-components suite untouched → still 42 files / 554 tests (zero package edits this phase).
  - **What shipped (all of Phase 3 items 1–5):**
    - New `src/components/shared/directory/`: `DirectoryGallery.tsx` (the one binding), `directory.module.scss`, `index.ts` barrel, and the generalised/moved `FolderNameDialog.tsx`, `MoveToFolderDialog.tsx` (now takes `excludeId` + title/label overrides for the folder-move case), `FolderTreeSelect.tsx`, `folderTree.ts` (+ new `descendantFolders` and exported `compareFolders`), `createHref.ts` (+ generic `folderCreateHref`) — all typed on `FolderRecord`.
    - `DirectoryGallery` prop surface: the EntityGallery pass-throughs (`items, state, adapters, keyExtractor, renderItem, itemLabel, itemHref, onItemActivate, renderActions, selectionMode, onSelect, ariaLabel, isReady, error, searchPlaceholder, sortOptions, filterOptions, filterLabel, showViewToggle, minItemWidth, maxItemWidth, itemGap, toolbarEndSlot, noMatch, className`) + `empty` (a `GalleryEmptyCopy` OR a factory `(ctx: { flatView, currentFolderId, createHref }) => GalleryEmptyCopy` so the caller keeps folder-aware copy) + `folders, getItemFolderId, folderApi, domainKey, createHref?, itemNoun?, allItemsLabel?, browseFoldersLabel?`. `TREE_ITEM_CAP = 12` exported.
    - Behaviour exactly per plan: `flatView = selectionMode || allItems || searchActive`; flat/picker → plain EntityGallery; tree → breadcrumb + focused folder's grid (EntityGallery) above a `TreeExplorer` over the focused root's subtree, per-node header = name + direct count, end-slot = new-subfolder / rename / move / delete, `renderNodeContent` = the folder's items sorted by the CURRENT sort adapter and capped at 12 (via `applyGallery` with `page:1,pageSize:CAP` — never `state.page`, pitfall 8) then a "Show all N →" focus row. `?folder=` parse+validate (unknown/non-numeric → root) moved into DirectoryGallery; expansion persisted controlled to `etymolog.treeExpansion.<domainKey>` (every access try/catch, parse-validated, pruned against the live slice). Folder mutations go through the passed provider-wrapped `folderApi` (auto-refreshes — no double-refresh).
    - Old `tabs/lexicon/folders/*` are re-export shims (`index.ts`, `folderTree.ts`, `createHref.ts`, `FolderTreeSelect.tsx`, `FolderNameDialog.tsx`, `MoveToFolderDialog.tsx`); `FolderBrowser.tsx` + `folders.module.scss` deleted (scss git-renamed to `directory.module.scss`). Verified importers (`LexiconViewPage`, `LexiconFormFields`, `LexiconHome`, `folderTree.test.ts`) all still resolve.
    - `LexiconGallery.tsx` rewritten to render `DirectoryGallery` (adapters/renderers/actions unchanged; "All words" toggle, folder-aware empty copy, `lexiconCreateHref` carried over; picker flatness delegated to DirectoryGallery).
    - New tests: `shared/directory/__tests__/DirectoryGallery.test.tsx` (14 — flat↔tree switching incl. search-escape/All-words/picker-always-flat, cap + Show-all focus updating `?folder=`, `?folder=` validation, localStorage corruption + pruning + persistence, `descendantFolders`) and `DirectoryGalleryCrud.test.tsx` (5 — create root/subfolder, rename, delete-reparent, move-folder — all against the REAL lexicon domain via sql.js + the provider-wrapped api). `LexiconFolders.test.tsx` updated in place (the 3 tests that asserted the retired FolderBrowser "Open folder X" rows now assert the inline "Expand folder X" tree + inline expansion; breadcrumb/deep-link/CRUD/search coverage retained; added a `localStorage.clear()` to its `beforeEach` since the tree now persists expansion).
  - **Deviations / notes:**
    1. **The focused folder's own items keep EntityGallery's normal pagination; only the TREE-SIDE (child-node) grids are cap-and-focus with no pager.** Interpretation of "no pagination in tree mode / do not reuse `state.page` tree-side" (pitfall 8) = the TreeExplorer node grids, which use `applyGallery(page:1,pageSize:CAP)` and never `state.page`. Keeping EntityGallery mounted in both modes (it renders the focused folder's grid) is deliberate: the search box then never unmounts across the flat↔tree switch, so a live search keeps focus mid-type. This matches the pre-Phase-3 LexiconGallery, which also paginated the current folder's grid.
    2. **`empty` accepts a factory** `(ctx) => GalleryEmptyCopy` (not just a plain object) because `?folder=`/`flatView` moved INTO DirectoryGallery, so the caller can no longer compute folder-aware copy itself; the factory hands those back (plus `createHref`). A plain object is still accepted for callers that don't need it.
    3. **`onMoveItem`/`refreshFolders` props from the plan's §3.1 prose were NOT added.** The provider-wrapped `folderApi` already refreshes both slices (verified — no `refreshFolders` needed), and per-card "move item to folder" is a Phase 4 concern (lexicon's move stays on the view page, api unchanged); adding an unused prop now would only trip the no-unused lint.
    4. **`MoveToFolderDialog` gained `excludeId` + `title`/`fieldLabel`/`submitLabel` overrides** so the ONE dialog serves both moving an ITEM (from a card/page) and moving a FOLDER (excludes the folder's own subtree). Backward compatible — the historical item-move call sites pass none of the new props.
    5. **Grid track sizing is a direct inline `style` (`gridTemplateColumns`/`gap`), not a CSS custom property.** A first pass used `var(--directory-item-min, 200px)`; the token ratchet rejects BOTH an undefined custom property AND a `var()` fallback argument, so the values are written straight onto the element instead.

- 2026-09-09: **Phase 4 COMPLETE — commit `ffe38c0`** `(etymolog): folder trees for glyphs and graphemes` (Scope A rollout + Scope B audit follow-ups in ONE commit — see deviation 1).
  - **Baselines re-confirmed BEFORE editing:** etymolog suite GREEN 130 files / 2557 tests; `tsc --noEmit` 0 errors. cyber-components untouched (zero `packages/` edits — verified via `git status`).
  - **Gates (after):** etymolog `vitest run` → **134 files / 2580 tests, all green** (+4 files, +23 tests). `tsc --noEmit` → 0 errors. eslint → clean on all 17 touched files. Color-token ratchet (`styles/__tests__/tokens.test.ts`) green (part of the full suite; no new SCSS). cyber-components suite unchanged (not touched this phase).
  - **What shipped (all of Phase 4 items 1–5):**
    - **Rollout:** `graphemeGallery.tsx` → `DirectoryGallery` (`domainKey:'grapheme'`, `folders: data.graphemeFolders`, `folderApi: api.graphemeFolder`, `getItemFolderId: g.folder_id`; kept `useGraphemeDelete`, the existing adapters/renderers/hrefs, `onGraphemeClick`, and selection-mode picker flatness). `galleryGlyphs.tsx` → `DirectoryGallery` (`domainKey:'glyph'`, `data.glyphFolders`, `api.glyphFolder`; KEPT `showViewToggle={false}`, `minItemWidth="160px"`, `maxItemWidth="1fr"`, and the Auto-manage `toolbarEndSlot` verbatim). Both gained folder-aware empty-state factories.
    - **Create-in-folder:** `glyphCreateHref` / `graphemeCreateHref` added next to `lexiconCreateHref` (via the generic `folderCreateHref`), exported through `shared/directory/index.ts` + `shared/index.ts`. `NewGlyphPage` / `NewGraphemePage` read `?folder=` and VALIDATE it against their OWN slice (`data.glyphFolders` / `data.graphemeFolders`; unknown/non-numeric → root/null, mirroring `LexiconEditor`), threading `folderId` into `useGlyphSubmit` / `useGraphemeSubmit`, which now pass `folder_id` on the create call (edit path unchanged). Galleries' empty CTAs use the per-domain `createHref` via the `empty` factory.
    - **Move-to-folder per card:** added ONCE in `DirectoryGallery` (not per gallery) — `effectiveRenderActions` wraps the caller's `renderActions` with a `folder-symlink` IconButton (`aria-label` = `Move <label> to folder`), gated on `!selectionMode && folders.length > 0`, opening an item-flavoured `MoveToFolderDialog` wired to `folderApi.setItemFolder({ itemId, folderId })` (item id from `keyExtractor`). All three domains (lexicon included) get it for free; lexicon's existing view-page Move button is untouched. No `onMoveItem` prop needed (deviation 3 of Phase 3 now resolved this way).
    - **Pickers stay flat:** asserted — `GlyphPickerModal` composes `EntityGallery` directly (never folder chrome), grapheme `selectionMode` returns the bare gallery.
    - **Scope B audit follow-ups (in the same commit):** (A) DirectoryGallery tree-side node grids, header counts and "Show all N" now apply the ACTIVE filter (`applyGallery` with `filter: state.filter` + `adapters.filter`; `filteredCountOf` for the header) instead of the hardcoded `GALLERY_FILTER_ALL`; the unfiltered `countOf` is kept for the delete-folder confirmation (it describes the ACTUAL rows reparented, which a filter must not understate). (B) `navigateToFolder` calls `state.setPage(1)` so a focus change never lands the focused-folder grid mid-page. (C) `EtymologProvider` gained `afterAllWithFolders` (all six slices) for `database.clear`/`database.reset` — the old `afterAll` refreshed only glyphs/graphemes/lexicon, leaving a stale folder tree after a wipe.
  - **New test files:** `tabs/grapheme/__tests__/GlyphFolders.test.tsx` (5 — filing shows only under folder / search escape / per-card move round-trip / delete-reparent / picker flat), `GraphemeFolders.test.tsx` (5 — same, picker = selection mode), `createInFolderLands.test.tsx` (4 — glyph+grapheme submit hooks persist folder_id, root default, word-symbol-at-root), `createInFolderRoute.test.tsx` (6 — create routes read+validate `?folder=` per domain incl. cross-domain isolation). Extended: `DirectoryGallery.test.tsx` (+2 — tree-mode filter consistency, page reset on focus change; `Harness` gained optional `adapters`/`filterOptions`), `EtymologContext.test.tsx` (+1 — clear refreshes the three folder slices).
  - **Deviations / notes:**
    1. **Scope A + Scope B shipped in ONE commit, not two.** The plan offered Scope B as an optional preceding commit "if cleaner" — it is not, because follow-ups A and B both live in `DirectoryGallery.tsx` alongside the Scope A item-move, so a file-level split is impossible and a hunk-level split (no interactive `git add -p` in this env) would be error-prone. The commit body enumerates both scopes.
    2. **Item-move centralised in `DirectoryGallery`, not added to each gallery's `renderActions`.** The plan's wording ("`renderActions` in ALL THREE galleries gains a Move action") is satisfied transitively — one wrapper gives all three domains the affordance with zero per-gallery duplication, honouring the "shared wrapper over duplicate implementations" mandate. Item id derives from `keyExtractor` (all three domains key on the numeric row id).
    3. **Filter-consistency (follow-up A) governs only the TREE-SIDE node grids/counts.** The focused-folder grid is `EntityGallery`, which already applies the filter itself; the fix targets the child-node grids that previously hardcoded `all`. The delete-folder confirmation deliberately keeps the unfiltered count.
  - Word-symbol-at-root is also covered at the API layer in Phase 1 (`glyphGraphemeFolders.test.ts`); re-asserted here because the galleries now surface folders.

- 2026-09-09: **Phase 5 — FINAL cross-cutting audit + comprehensive test pass. 2 real defects found + fixed; everything else audited CLEAN.**
  - **Baselines re-confirmed BEFORE editing:** cyber-components GREEN 42 files / 554 tests; etymolog GREEN 134 files / 2580 tests; etymolog `tsc --noEmit` 0 errors.
  - **DEFECTS FOUND + FIXED (both were the P2/P3 audit's flagged open notes — both live under `display/treeExplorer/`, additive-only):**
    1. **Dead `seenAsChild` set in `buildForest.ts`** — populated on every child, never read. Removed. Pure cleanup; forest behaviour unchanged (cyber suite still green). Commit `269e46e` `(cyber-components): final audit fix — drop dead seenAsChild + guard aria-controls on collapsed rows`.
    2. **`aria-controls` was a DANGLING IDREF on every COLLAPSED row.** The toggle button always emitted `aria-controls={contentId}`, but the content region is UNMOUNTED while collapsed, so the attribute named an element that did not exist — an a11y defect (AT would try to resolve a missing id). Fixed to `aria-controls={isOpen ? contentId : undefined}` (WAI-ARIA permits the attribute's absence until the controlled element is present; the ArrowRight "into first child" keyboard path traverses by `data-tree-content`, not by this attribute, so it is unaffected). Same commit `269e46e`. Regression: the existing `aria-expanded + aria-controls` test now also asserts a collapsed row exposes NO `aria-controls`.
  - **Areas audited CLEAN (no change needed):**
    - **Export→clear→import id identity.** Folder ids are written explicitly and re-inserted verbatim (then `fixAutoincrementSequences` sets each `sqlite_sequence` to MAX(id)), and import CLEARS all tables first — so a round-trip PRESERVES folder identity. `?folder=` deep links and persisted localStorage expansion ids therefore stay valid and point at the SAME folder after a restore. (JUDGMENT CALL, logged not fixed: the localStorage expansion key is per-DOMAIN, not per-conlang, so importing a *different* dataset into the same browser can leave a stale expanded id that now names a *different* folder of the same id — confusing but strictly non-destructive: the tree prunes ids absent from the slice, and `?folder=` only ever focuses an id that exists. No crash, no data loss. Not worth a per-conlang key.)
    - **`batchMutations` slice coverage.** Item create-with-folder_id (`glyph.create`→`glyphs`, `grapheme.create`→`graphemes`, `lexicon.create`→`lexicon`) and folder CRUD (`*Folder.create/rename/move`→its folder slice; `delete`→folder slice + item slice; `setItemFolder`→item slice only) touch DISJOINT slices; a mixed batch flushes each recorded slice exactly once, none missed. `database.clear`/`reset` refresh all six slices via `afterAllWithFolders`. (Covered by `EtymologContext.test.tsx`.)
    - **Migration real v7→v8 with existing folders + items** — `migrations.test.ts` builds a populated v7 DB (via the v6+v7 `up` fns) and applies exactly v8; the v8 `up` only ADDS the two new folder tables + `glyphs/graphemes.folder_id`, never touching the v7 lexicon-folder side, and the FK check passes. Items survive at root; the FK SET-NULL-on-folder-delete holds.
    - **Word-symbol path with folders** — auto-created glyph + grapheme land at ROOT (`folder_id` null); asserted at the API layer and now in the three-domain scenario.
    - **Pickers flat everywhere** — `GlyphPickerModal` composes `EntityGallery` in `selectionMode`; grapheme/glyph galleries in `selectionMode` make `DirectoryGallery` return the bare gallery (no folder chrome). Verified by grep + existing picker tests.
    - **No double-activation** — `EntityGallery` never wires `DataGallery.onItemActivate`; activation lives on the card (`Link`/`button`). `DirectoryGallery`'s own tree-side `renderCard` uses the same `!to && onItemActivate` guard. `onItemActivate` is only ever a card prop (grep-confirmed).
    - **No `state.page` tree-side** — the only `state.setPage(1)` is in `navigateToFolder`; node grids call `applyGallery(..., { page: 1, pageSize: TREE_ITEM_CAP })`.
    - **The five sniffed error substrings** (`not found`, `cannot exceed`, `into itself`, `own descendant`, `needs a name`) are intact in `folderDomain.ts` and mapped by `folderApi.fromError`.
    - **Corrupt-cycle rendering** — `buildForest`, `folderPath`, `descendantFolders`, `subtreeHeight`, `depthOf`, `descendantIds` every walk carries a visited guard; a smuggled cyclic folder slice renders (one member promoted to root, the other nested once) and terminates. Now covered by a DirectoryGallery test.
  - **Comprehensive tests added (plan §3 Phase 5 item 2):**
    - cyber-components `treeExplorer.test.tsx` (+4 tests, commit `b9aec6b` `(cyber-components): tree-explorer comprehensive test pass`): 12-deep render + depth-12 interactability; indent STEP capped at `indentCap` with all 12 levels present; controlled/uncontrolled parity under one interaction script; header-button depth-first document/tab order + no button-in-button. (The depth-13 create/move REJECTION is already covered engine-side in `folderDomain.test.ts`.)
    - etymolog (+7 tests, commit `4b97750` `(etymolog): tree-explorer comprehensive test pass`): `DirectoryGallery.test.tsx` +6 (localStorage poison matrix ×4 — non-array JSON, non-int array with a valid int surviving, null/boolean elements, throwing accessor; cyclic-slice render + CRUD ×2); NEW `db/exportImport/__tests__/threeDomainScenario.test.ts` +1 (three-domain seed → export → wipe → import → per-domain breadcrumb/descendant/membership invariants, with a moved folder in each domain and a word-symbol staying at root).
  - **FINAL GATES (all green):** cyber-components `pnpm test` → **42 files / 558 tests** (from 554; +4). etymolog `pnpm test` → **135 files / 2587 tests** (from 134/2580; +1 file, +7 tests). etymolog `npx tsc --noEmit` → **0 errors**. eslint → **clean** on all five touched files (cyber files linted from the worktree root with the etymolog flat config so they fall in base path). Commits: `269e46e` (fix), `b9aec6b` (cyber tests), `4b97750` (etymolog tests).
  - **Browser smoke (plan §3 Phase 5 item 4) NOT performed** — this task was scoped to the adversarial audit + comprehensive tests; the live smoke, README/version bump (item 5) and the master merge (item 6) remain for the release-prep pass.

- 2026-09-09: **Browser-smoke fix pass — 3 defects fixed (1 P0 + 2 UX), 1 verification cleared.** Commit `(etymolog): smoke fixes — dialog overlay lifecycle, open-folder affordance, Enter submit`. Files: `shared/directory/FolderNameDialog.tsx`, `shared/directory/MoveToFolderDialog.tsx`, `shared/directory/DirectoryGallery.tsx`, `shared/directory/__tests__/DirectoryGallery.test.tsx`.
  - **Baselines re-confirmed BEFORE editing:** etymolog suite GREEN 135 files / 2587 tests; `tsc --noEmit` 0 errors.
  - **Gates (after):** etymolog `vitest run` → **135 files / 2595 tests, all green** (+8 tests, no new file). `tsc --noEmit` → 0 errors. eslint → clean on all four touched files. Color-token ratchet (`styles/__tests__/tokens.test.ts`) green (part of the full suite; the one new icon adds no colour literal). cyber-components untouched (`packages/` not modified — per task scope).
  - **DEFECT 1 (P0) — ROOT CAUSE: a closed dialog stranded an invisible, full-viewport, click-eating headlessui shell.** The two shared dialogs mounted the cyber `<Modal>` PERMANENTLY and gated only the INNER form on `{isOpen && <Form/>}` inside a live `<Modal isOpen={isOpen}>`. `<Modal>` (packages/cyber-components/container/modal/modal.tsx — READ-ONLY here) renders a headlessui `<Dialog open={isOpen}>` whose `<DialogBackdrop transition>` + `<DialogPanel transition>` run CSS enter/leave transitions. On close, `isOpen` flips false in the SAME render that empties the panel: the `{isOpen && …}` gate unmounts the form's content instantly, while headlessui — mid-transition — keeps the Dialog's `_container_` (100vw×100vh, `pointer-events: auto`) and its now-EMPTY `_panel_` mounted waiting for a `transitionend` that never resolves for the emptied, content-less panel. The panel stays tagged `data-headlessui-state="open"` / `data-open` / `data-enter`, so `document.elementFromPoint` returns that container for every later click and all real pointer input dies (synthetic `.click()` still dispatches, which is why the jsdom/happy-dom suites passed). Reachable after create, rename, folder-move AND item-move — every folder dialog in the app.
    - **Fix (at the CAUSE, no pointer-events bandaid, no `packages/` edit):** gate the ENTIRE `<Modal>` on `isOpen` (`if (!isOpen) return null;` then `<Modal isOpen …>`) in BOTH `FolderNameDialog` and `MoveToFolderDialog`, so the headlessui `Dialog` and its content share ONE lifecycle — open mounts both, close UNMOUNTS both (portal and all) atomically, leaving nothing to strand. This is the plan's "unmount the whole Dialog when closed" option. Form-state-fresh-per-open still holds: the Modal remounts each open, so `useState(initialName)`/`useState(currentFolderId)` reseed with no reseeding effect (React-Compiler-lint-safe). Because the fix lives inside the two shared dialog modules, ALL usages are covered in one place: DirectoryGallery's create/rename/folder-move/item-move dialogs AND the word-view-page move dialog (`LexiconViewPage.tsx`, which imports the shared `MoveToFolderDialog` via the `tabs/lexicon/folders` shim). Glyph/grapheme galleries get it for free (they drive the same DirectoryGallery).
    - **Audit of OTHER modals:** `exportImport/ImportJsonModal.tsx`, `exportImport/ImportImageModal.tsx`, `display/customChart/CreateChartModal.tsx` use the same permanently-mounted-Modal + `{isOpen && …}` inner-gate shape and are the same latent class — but they belong to unrelated features OUTSIDE the tree-explorer epic, so they are logged here and left untouched (scope discipline). The proper long-term fix is in cyber `<Modal>` itself (own the mount/unmount so consumers can keep the inner gate), which this task's "do not touch `packages/`" constraint forbids.
  - **DEFECT 2 (UX) — small folders had no focus affordance.** Focus was reachable only via the ">TREE_ITEM_CAP" "Show all N →" row and the breadcrumb (ancestors only), so a folder with ≤12 items could never become the `?folder=` root — its create-in-folder CTA and deep link were unreachable. **Fix:** an always-present `box-arrow-in-right` IconButton (`aria-label` `Open folder <name>`) rendered FIRST in each tree node's `endSlot` (before New-subfolder / Rename / Move / Delete) in `DirectoryGallery.renderEndSlot`, wired to the existing `navigateToFolder(folder.id)` — the same path "Show all" uses (which already resets `state.setPage(1)`).
  - **DEFECT 3 (UX) — Enter did not submit FolderNameDialog.** The field previously relied on an `onKeyDown` Enter handler with a `submitType="button"` action; the name field + actions now live inside a real `<form onSubmit>` and the action is a genuine `type="submit"` button, so Enter submits natively exactly as the button does, with the empty-name guard (`disabled` + the handler's `canSubmit` check) honoured on both paths. (happy-dom does not synthesise implicit form submission from a keydown, so the regression test dispatches the `submit` event the browser would fire on Enter.)
  - **VERIFICATION CLEARED (no fix needed):** the "New folder" and "All glyphs / All graphemes / All words" toolbar buttons DO carry visible text content (`IconButton` renders `IconSpan` text; the toggle is a `<Button>` with a text child), so each has an accessible name from its text — the "nameless button with inner generic text" in the a11y dump was a dump artifact, not a missing label.
  - **New tests (all in `DirectoryGallery.test.tsx`, +8):** open-folder affordance ×3 (renders on a FEW-item node with no Show-all row; click focuses `?folder=` + updates the breadcrumb; resets grid to page 1); FolderNameDialog form submission ×3 (field is inside a `<form>` with a `type="submit"` button; a form submit creates the folder; the empty-name guard blocks submit); dialog lifecycle ×2 (Defect-1 regression — after create→close AND after item-move→close, NO element carries `data-headlessui-state="open"` and no `#folder-name-input` / `[role="dialog"]` remains; each asserts a dialog WAS open mid-flow so the check is not vacuous). The pre-existing CRUD round-trips (`DirectoryGalleryCrud.test.tsx`, real lexicon domain) stay green, confirming create/rename/folder-move/delete-reparent still work through the re-gated Modal.

- 2026-09-09: **P1 DATA-LOSS FIX — folder mutations never marked the DB dirty for IndexedDB persistence.** Commit `(etymolog): P1 fix — persist folder mutations (setItemFolder & co. never marked the DB dirty)`. File changed: `src/db/folderDomain.ts` (engine — fixes all three domains at once). Test added: `src/db/__tests__/folderPersistence.test.ts`.
  - **ROOT CAUSE.** The persistence dirty-mark is triggered in exactly ONE place: `utils/transaction.ts:71`, where `withTransaction()` calls `schedulePersist()` when its OUTERMOST transaction commits. A bare `db.run(...)` mutates the live sql.js DB but schedules NOTHING. In `folderDomain.ts` (the engine every domain runs through), `createFolder` and `deleteFolder` wrapped their writes in `withTransaction` — so they persisted — but the three SINGLE-statement writes did not: `updateFolder`/`renameFolder` (bare UPDATE), `moveFolder` (bare UPDATE parent_id), and `setItemFolder` (bare UPDATE of the item's `folder_id`). Each wrote to memory, the provider's after-hook refreshed the slice (so the UI updated correctly), but no save was ever scheduled. The persistence scheduler stayed idle/`saved` (`dirty:false`) — hence the "Saved" indicator lied — and on a hard reload the DB was rebuilt from the last snapshot, which never captured the move. **Why folder-CREATE survived but the item-MOVE didn't:** create goes through `withTransaction` (it needs `lastInsertId` inside the txn); `setItemFolder`/`move`/`rename` were single statements that the original author left un-wrapped, on the mistaken assumption (encoded in the old file-header comment) that "single statements rely on the connection's implicit transaction" — true for ATOMICITY, but persistence-scheduling only ever hangs off `withTransaction`, never the implicit transaction.
  - **SCOPE — the lexicon v7 path WAS already broken pre-epic.** Verified against `git show master:apps/etymolog/src/db/folderService.ts`: the original lexicon-only service had the identical shape — `createFolder`/`deleteFolder` wrapped, but `updateFolder` (:217), `moveFolder` (:274) and `setLexiconFolder` (:322) were bare `db.run`. So the lexicon view-page word-move, folder rename and folder move never survived a reload in v7 either; Phase 1 ported the bug verbatim into the engine, which then spread it to the glyph and grapheme domains. The fix in the engine closes all three domains AND the pre-existing lexicon bug in one place. (The `folder_id`-on-create paths — `createGlyph`/`createGrapheme` — were NOT affected: both already wrap in `withTransaction`. Import uses `persistDatabaseNow()`. Refresh wiring in `EtymologProvider` was complete; only persistence wiring was wrong.)
  - **FIX (mirrors the existing mechanism, no new machinery):** wrapped the write + return of `updateFolder`, `moveFolder` and `setItemFolder` in `withTransaction(db, () => …)` — byte-identical to how `createFolder`/`deleteFolder` here and `glyphService.updateGlyph` (a single-statement UPDATE) already do it. Corrected the misleading file-header comment. No behavioural change beyond the now-scheduled save; the no-op early return in `updateFolder` (no fields to change) deliberately stays un-wrapped since it writes nothing.
  - **TESTS:** `folderPersistence.test.ts` — a `describe.each` over all three domains (lexicon/glyph/grapheme) asserting, via the scheduler's observable API (memory adapter + `getPersistenceState()`/`flushPersist()`, following `persistence.test.ts`), that create / rename / update-reorder / move / delete / setItemFolder each leave the scheduler `dirty:true` + `status:'pending'` on success (baseline settled to `dirty:false` first so each assertion isolates the mutation under test); plus a per-domain integration test: setItemFolder → `flushPersist()` → open a NEW `createDetachedDatabase` from the bytes the adapter ACTUALLY saved → the item's `folder_id` membership survived. 21 tests (7 × 3).
  - **GATES:** full etymolog `vitest run` → **136 files / 2616 tests, all green** (from 135/2595; +1 file, +21). `npx tsc --noEmit` → **0 errors**. eslint → **clean** on both touched files. cyber-components untouched (`packages/` not modified — per task scope).

- 2026-09-09 BROWSER SMOKE (live Chrome, alpha-etymolog:5178, manager-driven): VERIFIED — v7→v8 migration applied live on existing IndexedDB conlang; lexicon tree (Nouns→Entities inline expansion, count badges, word card in nested folder); expansion persists reload (localStorage [1,2]); ?folder=2 deep link + breadcrumb; glyph domain: folder create via dialog, item move-to-folder, create-in-folder CTA href carries ?folder=1, open-folder affordance focuses + updates URL; grapheme tab chrome present; post-dialog clickability (P0 fix verified via elementFromPoint); persistence fix verified live (move survives hard reload). FOUND + FIXED during smoke: stuck dialog overlay (339ec01), missing small-folder focus affordance + Enter submit (339ec01), setItemFolder persistence P1 (b085b24). NOT AUTOMATABLE: Enter-to-submit delivery (pane key events don't reach the page — form structure verified correct in live DOM); full-page tree screenshots (document-scroller capture artifact).

## §6 Pitfalls — READ EVERY ONE (hard-won; several caused real outages)

1. **Worktree discipline.** Author ONLY in the alpha worktree; absolute paths everywhere; cwd
   resets between Bash calls (a relative-path append once landed a stray file in the MAIN tree).
   Never `rm -rf` under `.claude/worktrees/` (NTFS junctions — it guts MAIN's node_modules).
   Never non-frozen `pnpm install`. Stage by explicit path. Commits in the worktree are normal;
   the MAIN tree refuses commits (integration only).
2. **cyber-components edits must be ADDITIVE.** New `display/treeExplorer/` dir + one
   COMPONENT_DIRECTORY.md append. The package is deep-imported source by nochi/taxonia — touching
   an existing file risks other apps invisibly. Do NOT import `next`, `react-router-dom`, or
   anything etymolog from TreeExplorer. Do NOT "fix" expandableContainer.
3. **No new workspace package.** The triple-alias trap (vite/vitest/tsconfig — miss one and the
   worktree junction silently resolves the MAIN checkout) is exactly why we chose cyber-components.
4. **Migration parity.** Fresh `createSchema()` and migrate-from-v7 must produce identical
   schemas; the parity test enforces it. FK order: folder tables BEFORE glyphs/graphemes in fresh
   DDL. Copy the v7 migration entry's exact shape incl. the `foreignKeyViolationCount()` assert.
   sql.js specifics: `db.getRowsModified()`, `datetime('now')`, `withTransaction` around every
   multi-statement write.
5. **The closed RefreshError union** (`etymologContext.ts:33`) and `EMPTY_DATA` and
   `batchMutations`' slice keys must ALL learn the new slices, or refreshes silently no-op / TS
   breaks far from your edit.
6. **folderApi's `fromError` string-sniffs service messages.** Keep the five message substrings
   byte-identical in the generalized engine, or update fromError in the SAME commit with tests.
7. **Double activation.** Card activation lives on `EntityCard` (Link/button). NEVER also pass
   `onItemActivate` to DataGallery, and in tree mode never make the folder header button wrap the
   item cards (button-in-button is invalid AND double-fires).
8. **No setState during render.** `applyGallery` derives the clamped page — keep that model. In
   tree mode there is no pagination; do not reuse `state.page` for anything tree-side.
9. **localStorage is hostile.** Try/catch every access (some contexts THROW on the accessor);
   validate the parsed shape; prune stale ids against the live slice; corrupt → empty set, never
   a crash.
10. **Search escapes folders; pickers are always flat.** `flatView = selectionMode || allItems ||
    searchActive` is shipped, tested semantics — replicate exactly, don't "improve".
11. **`?folder=` must be validated against the loaded slice** (unknown/non-numeric → root) —
    a stale deep link once crashed word creation (fixed in the last epic); don't regress it.
    Never hand-build route paths — `ROUTES` + `resolveUrl()`.
12. **Color-token ratchet:** zero color literals in app SCSS/TSX; semantic CSS variables only —
    also in the new cyber-components SCSS.
13. **Baselines before blame.** Record cyber-components' and etymolog's suite + tsc state BEFORE
    editing (log in §5). Pre-existing failures are not yours; new ones are. Repo convention:
    stash-diff per (file, TS-code), never absolute error counts.
14. **`category` ≠ folders.** The glyph/grapheme `category` column (only value: 'logogram') is
    the word-symbol marker. Do not migrate it into folders, filter on it, or rename it.
15. **Word-symbol auto-created glyph/grapheme go to ROOT** — folder ids don't translate across
    domains. Decided; note it in the create path's comment.
16. **Reuse shipped guards, don't reinvent:** visited-set on EVERY tree walk (corrupt imports can
    smuggle cycles); `compareFolders` total order (position → name → id); delete = reparent both
    child folders AND items in ONE transaction (nothing is ever deleted by a folder op).
17. **Old import paths keep working.** `tabs/lexicon/folders/*` gets re-export shims when the
    dialogs move to `shared/directory/`; `folderService.ts` re-exports the lexicon domain.
    Grep for every importer before moving anything.
18. **etymolog's vitest suite is slow (~85 s import-heavy).** Run targeted suites while iterating;
    the FULL suite is the phase gate, not the inner loop.
19. **Agent yields without a report:** if a phase agent stalls, verify its work directly in the
    worktree (`git -C <worktree> status/diff`) instead of spawning a context-less resume agent —
    that failure mode burned time in the last epic.

## §7 Human items (mirror into apps/etymolog/todo.md at the end)

- Push `master` to origin (human decision).
- Re-snapshot the Kerbash/etymolog Pages mirror after merge.
- Tell the feedback author folders now span glyphs/graphemes too, with the inline tree.
