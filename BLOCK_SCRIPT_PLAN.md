# Block script (abugida / Mayan-style glyph blocks) — implementation plan

Status legend: `[ ]` pending · `[~]` in progress · `[x]` done + audited.

Owner decisions (2026-09-24), settled — do not reopen:

1. A **variant** is the same sound with a different look. Phonemes stay on the
   grapheme; a variant only changes glyphs.
2. Template slots are **free-form rectangles** on a unit canvas. Each rectangle
   is assigned a **variant group**; the composer picks, for the entry in that
   slot, the grapheme's variant in that group (falling back to the default
   variant, visibly). No aspect-ratio guessing.
3. **One block scheme per script.** Per-word variation comes from templates and
   from explicit boundaries, never from a per-word "which scheme" selector.

## 0. Vocabulary

| Term | Meaning |
|---|---|
| **Glyph** | Atomic SVG drawing (`glyphs`). Unchanged. |
| **Grapheme** | A sign with a sound value (`phonemes`) and one or more **variants**. |
| **Variant** | One visual form of a grapheme: an ordered glyph list. Exactly one per grapheme is the **default**. Optionally belongs to a **variant group**. |
| **Variant group** | Script-level named bucket ("head", "geometric", "prefix form"…). A grapheme has at most one variant per group. |
| **Role** | A slot type in the block scheme (`C1`, `V`, `C2`, `LOGO`, `Tone`…). User-named. Has a **matcher** deciding which spelling entries may fill it. |
| **Template** | A block shape: a **pattern** (ordered role ids, e.g. `[C1, V, C2]`) plus a **layout** (one rectangle per pattern role, each with a variant group). |
| **Block** | A run of spelling entries matched to one template and composed into ONE renderable unit (one `<svg>`). |
| **Boundary** | An explicit block break inside a word: the IPA syllable separator `.` in the pronunciation / spelling. |

## 1. Architecture in one picture

```
glyph_order  ──parse──►  SpellingDisplayEntry[]  (unchanged funnel: buildSpellingDisplay)
                                │
                                ▼   normalizeSpellingDisplay(entries, context)
                    context.blockScheme?  ── no ──►  one RenderableGlyph per glyph  (today's path, byte-identical)
                                │ yes
                                ▼
                    segment(entries, scheme, classify)   → Block[]  (pure, src/blocks/)
                                ▼
                    composeBlock(block, graphemeIndex)    → one RenderableGlyph { block: {...}, svg_data }
                                ▼
            existing strategies (ltr / composed-block / …) position blocks as single glyphs — UNCHANGED
```

Everything downstream of normalization (strategies, `GlyphSpellingCore`,
`InteractiveGlyphDisplay`, the translator, cards, charts) is untouched. That
is the whole reason the feature can land without feeling bolted on.

## 2. Data model

### 2.1 New / changed tables (migration **v9**)

```sql
-- Script-level named groups. Referenced by variants AND by template slots (JSON).
CREATE TABLE IF NOT EXISTS variant_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS grapheme_variants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    grapheme_id INTEGER NOT NULL,
    group_id INTEGER NULL REFERENCES variant_groups(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (grapheme_id) REFERENCES graphemes(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_grapheme_variants_grapheme ON grapheme_variants(grapheme_id);
-- exactly one default per grapheme (partial unique index; sql.js supports it)
CREATE UNIQUE INDEX IF NOT EXISTS idx_grapheme_variants_default ON grapheme_variants(grapheme_id) WHERE is_default = 1;
-- at most one variant per (grapheme, group); NULL group is exempt by SQL semantics
CREATE UNIQUE INDEX IF NOT EXISTS idx_grapheme_variants_group ON grapheme_variants(grapheme_id, group_id);

-- REBUILT (see pitfall P1): variant_id added, UNIQUE re-keyed on the variant.
CREATE TABLE IF NOT EXISTS grapheme_glyphs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    grapheme_id INTEGER NOT NULL,
    variant_id INTEGER NOT NULL,
    glyph_id INTEGER NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    transform TEXT,
    FOREIGN KEY (grapheme_id) REFERENCES graphemes(id) ON DELETE CASCADE,
    FOREIGN KEY (variant_id) REFERENCES grapheme_variants(id) ON DELETE CASCADE,
    FOREIGN KEY (glyph_id) REFERENCES glyphs(id) ON DELETE RESTRICT,
    UNIQUE(variant_id, glyph_id, position)
);
-- keep idx_grapheme_glyphs_grapheme / _glyph / _position; add
CREATE INDEX IF NOT EXISTS idx_grapheme_glyphs_variant ON grapheme_glyphs(variant_id, position);

-- The block scheme: ONE row, a JSON document (validated in TS, like settings).
CREATE TABLE IF NOT EXISTS block_scheme (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    definition TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
);
```

Migration v9 steps, in order, inside the runner's transaction with
`foreignKeysOff: true`:
1. create `variant_groups`, `grapheme_variants` (+ indexes), `block_scheme`;
2. `INSERT INTO grapheme_variants (grapheme_id, name, is_default, sort_order) SELECT id, 'Default', 1, 0 FROM graphemes`;
3. rebuild `grapheme_glyphs` with the DDL above (`CREATE TABLE grapheme_glyphs_new …; INSERT … SELECT gg.id, gg.grapheme_id, v.id, gg.glyph_id, gg.position, gg.transform FROM grapheme_glyphs gg JOIN grapheme_variants v ON v.grapheme_id = gg.grapheme_id AND v.is_default = 1; DROP TABLE grapheme_glyphs; ALTER TABLE grapheme_glyphs_new RENAME TO grapheme_glyphs;` then recreate the indexes);
4. `PRAGMA foreign_key_check` must be empty, else throw (registry convention).

Invariants (enforced in the service layer AND checked by `repairOrphans`):
- every grapheme has exactly one default variant;
- every variant has ≥ 1 glyph row (an empty non-default variant is deleted, an
  empty default is a rejected write — "a grapheme needs at least one glyph");
- `grapheme_glyphs.grapheme_id` always equals its variant's `grapheme_id`.

### 2.2 TypeScript types (`src/db/types.ts`)

```ts
export interface VariantGroup { id: number; name: string; sort_order: number; created_at: string; updated_at: string }
export interface GraphemeVariant { id: number; grapheme_id: number; group_id: number | null; name: string; is_default: boolean; sort_order: number; created_at: string; updated_at: string }
export interface GraphemeVariantWithGlyphs extends GraphemeVariant { glyphs: Glyph[] }
export interface GraphemeGlyph { …existing…; variant_id: number }
export interface CreateGraphemeGlyphInput { glyph_id; position; transform?; }           // unchanged shape
export interface CreateGraphemeVariantInput { name: string; group_id?: number | null; glyphs: CreateGraphemeGlyphInput[]; sort_order?: number }
export interface CreateGraphemeInput { …existing (glyphs = the DEFAULT variant's glyphs)…; variants?: CreateGraphemeVariantInput[] }
// GraphemeComplete / GraphemeWithGlyphs: `glyphs` keeps meaning THE DEFAULT VARIANT's glyphs.
export interface GraphemeComplete extends Grapheme { glyphs: Glyph[]; phonemes: Phoneme[]; variants?: GraphemeVariantWithGlyphs[] }
//   `variants` is OPTIONAL on the type (like `folder_id` after v8) so the hundreds of
//   test fixtures / mocks that build GraphemeComplete literals keep type-checking.
//   Absent ⇒ treat as [default variant only]. The service ALWAYS populates it.
export interface SpellingDisplayEntry { …; variantId?: number }                          // a pinned variant
```

### 2.3 Spelling entries (`src/db/utils/spellingUtils.ts`)

`grapheme-12` = grapheme 12, variant chosen automatically (default / by slot).
`grapheme-12@34` = grapheme 12 with variant 34 **pinned**.

- `GRAPHEME_ENTRY_RE = /^grapheme-(\d+)(?:@(\d+))?$/` — use it in
  `isGraphemeEntry`, `extractGraphemeId`, new `extractVariantId`, and
  `parseSpellingEntry` (adds `variantId?`). Today `parseInt('12@34')` happens to
  return 12 — do NOT rely on that; make the regex the single parser.
- `createGraphemeEntry(id, variantId?)`.
- `stripVariantPins(glyphOrder, variantId)` → entries with that pin removed
  (used when a variant is deleted). `lexiconService.handleVariantDeletion(variantId)`
  rewrites every word whose `glyph_order` contains `@<variantId>` (a `LIKE '%@34"%'`
  prefilter is fine, but re-parse before rewriting).
- Pins live only in MANUAL spellings. `deriveAutoSpelledGlyphOrder` never emits
  pins, so an auto-spelled word never has any — consistent with "auto-spell
  owns the spelling".

### 2.4 Block scheme document (`src/blocks/types.ts`)

```ts
export type RoleMatcher =
    | { kind: 'class'; letter: ClassLetter }     // generator's C/V/P/F/S/N/L/G/R/O via classOf(describePhoneme(...))
    | { kind: 'syllable' }                        // a sign whose phoneme is >1 IPA token ("ka")
    | { kind: 'category'; category: string }      // e.g. 'logogram' (WORD_SYMBOL_CATEGORY)
    | { kind: 'any' };

export interface BlockRole     { id: string; label: string; colour?: string; matcher: RoleMatcher }
export interface BlockSlot     { roleId: string; groupId: number | null; x: number; y: number; w: number; h: number } // unit square, 0..1
export interface BlockTemplate { id: string; name: string; pattern: string[]; slots: BlockSlot[] }
export interface BlockScheme   { version: 1; enabled: boolean; roles: BlockRole[]; templates: BlockTemplate[] }
```

Validation rules (`validateBlockScheme(raw): { scheme, issues }`, same style
as `settingsSchema.ts` — lenient parse, every issue has a `path`):
- role ids unique, non-empty; labels non-empty;
- a template's `pattern` has ≥ 1 entry, every entry is an existing role id,
  **no role appears twice in one pattern** (want two consonants? define `C1`
  and `C2`);
- `slots.length === pattern.length` and the slot role ids are exactly the
  pattern's (order of `slots` is irrelevant);
- `0 ≤ x,y`, `w,h > 0`, `x+w ≤ 1`, `y+h ≤ 1` (clamp with an issue, do not drop);
- `groupId` is `null` or a positive integer (existence is checked against the
  DB at compose time, NOT here — the scheme validator is pure);
- overlapping rectangles are ALLOWED (infixes are a real thing); no issue.
- Unknown keys → issue + dropped. Missing `enabled` → false.

Defaults: `EMPTY_BLOCK_SCHEME = { version: 1, enabled: false, roles: [], templates: [] }`.
A fresh database has NO `block_scheme` row; the API returns the default.

## 3. The engine (`src/blocks/`, pure, no React, no DB)

```
src/blocks/
  types.ts            (§2.4)
  validate.ts         validateBlockScheme, EMPTY_BLOCK_SCHEME
  classify.ts         entryClasses(entry, graphemeIndex) → EntryClass; roleAccepts(role, cls)
  segment.ts          segmentEntries(entries, scheme, graphemeIndex) → Segment[]
  compose.ts          composeBlockSvg(block, graphemeIndex) → { svg, slots }
  index.ts
  __tests__/
```

### 3.1 classify

```ts
export type EntryClass =
    | { kind: 'phoneme'; letters: ClassLetter[]; category: string | null }
    | { kind: 'syllable'; category: string | null }     // phoneme string tokenizes to > 1 token
    | { kind: 'silent'; category: string | null }       // grapheme with no phonemes (logogram)
    | { kind: 'boundary' }                              // the '.' entry
    | { kind: 'structural' }                            // role: word-separator / line-break / punctuation
    | { kind: 'unknown' };                              // IPA fallback describePhoneme() === null, etc.
```
- Grapheme entry: pick the first phoneme with `use_in_auto_spelling`, else the
  first phoneme. `tokenizeIpa(phoneme)` (from `generator/phonology/tokenize`):
  1 token → `describePhoneme(token.text)` → `classOf(features)`; > 1 non-separator
  token → `syllable`; none → `silent`.
- IPA entry: `ipaCharacter === '.'` → `boundary`; otherwise `describePhoneme`.
- `roleAccepts(role, cls)`: `any` accepts phoneme/syllable/silent/unknown (never
  boundary/structural); `class` needs `phoneme` with the letter; `syllable`
  needs `syllable`; `category` compares `cls.category` (case-sensitive, trimmed).

### 3.2 segment

Greedy, left to right, over the entry list:
- a `structural` entry or a `boundary` closes the current run; structural
  entries pass through as their own single-entry segment (`kind: 'passthrough'`),
  boundaries are consumed and produce nothing;
- at position `i`, try templates **in scheme order** (the designer shows the
  order and says "first match wins — put longer patterns first"); a template
  matches when for every `k < pattern.length`, `roleAccepts(role[k], class(entries[i+k]))`
  and no boundary/structural sits inside `[i, i+len)`;
- first match → `{ kind: 'block', templateId, entryIndices: [i..i+len) }`, `i += len`;
- no match → `{ kind: 'single', entryIndices: [i] }`, `i += 1`.

Output: `Segment[]`. Deterministic; unit-test it with fake graphemeIndexes.

### 3.3 compose

For a `block` segment: `viewBox="0 0 100 100"`; for each slot, entry
`entries[idx]`, grapheme `g`:
- variant = `g.variants.find(v => v.group_id === slot.groupId)` if `groupId !== null`,
  else the default; **missing** → the default + `missingGroup: true` (the UI
  shows a hint; rendering never fails);
- the variant's glyphs → `combineSvgStrings(glyphs.map(svg))` when > 1, else
  the single SVG (reuse `graphemeUtils.combineSvgStrings` — do NOT reimplement
  viewBox parsing; if the import direction is wrong, MOVE `combineSvgStrings` +
  `parseSvgViewBox` + `extractSvgInner` to `src/db/utils/svgCompose.ts` and
  re-export from the old path);
- nest: `<svg x="${x*100}" y="${y*100}" width="${w*100}" height="${h*100}" viewBox="…" preserveAspectRatio="xMidYMid meet">inner</svg>`;
- an IPA (virtual) entry in a slot uses the same text SVG normalization
  already generates (`generateVirtualSvg` — export it from normalization.ts or
  move it beside `virtualGlyph.ts`).

Return `{ svg, slots: [{ roleId, entryIndex, variantId, missingGroup }] }`.

For a `single` segment: nothing is composed; normalization emits the entry
exactly as today (a grapheme → its default-variant glyphs, or its PINNED
variant's glyphs when `variantId` is set).

## 4. Rendering integration

- `RenderableGlyph` gains `block?: { templateId: string; entryIndices: number[]; slots: ComposedSlot[]; containsVirtual: boolean }`.
  `sourceIndex` = first entry index. `id` = `generateVirtualGlyphId(blockKey)`
  where `blockKey` = template id + the raw entry values + chosen variant ids
  (stable across renders, unique enough for keys); `isVirtual: false`.
- `NormalizationContext` gains `blockScheme?: BlockScheme | null` and
  `graphemeMap` must now carry `variants` (it already carries `GraphemeComplete`).
- `normalizeSpellingDisplay`: when `context.blockScheme?.enabled`, run
  segment + compose; otherwise the current code path verbatim (snapshot test it:
  scheme absent ⇒ output identical to today for the same input).
  Pinned variant (`entry.variantId`) applies on the non-block path too.
- `GlyphSpellingDisplay` reads the scheme from a new optional context hook
  `useOptionalBlockScheme()` (returns `null` outside `EtymologProvider`, so the
  component's existing tests keep working) and accepts a `blockScheme` prop
  that overrides it (`null` = force off, used by the Script Maker's own
  variant previews which must show ONE variant, not a block).
- `EtymologContext` gets two slices: `variantGroups: VariantGroup[]` and
  `blockScheme: BlockScheme`; refresh matrix: any `variantGroup.*` or
  `blockScheme.*` mutation refreshes them; grapheme mutations already refresh
  `graphemesComplete` (which now includes variants).

## 5. Phases

Every phase: implement → agent writes tests → I audit + run
`pnpm --filter etymolog test:run <paths>` and `pnpm --filter etymolog typecheck`
(diff against the 37 pre-existing errors, never the absolute count) → commit
`(etymolog): …` from the alpha worktree, staged by path.

### Phase 1 — Variants + groups: data layer  `[x]` (74e69cf)

Files: `db/migrations/{schema,index,version,repair}.ts`, `db/types.ts`,
`db/graphemeService.ts`, new `db/variantService.ts` (groups + variants),
`db/api/{graphemeApi,types,index}.ts`, new `db/api/variantApi.ts`,
`db/utils/spellingUtils.ts`, `db/lexiconService.ts` (`handleVariantDeletion`),
`db/context/*` (slices), `db/exportImport/{types,validateExport,jsonCodec}.ts`,
`db/database.ts` (`ALL_TABLES_CHILDREN_FIRST`, `REQUIRED_TABLES`),
`config/version.ts` (`EXPORT_SCHEMA_VERSION` 3 → 4),
`db/__tests__/fixtures/legacySchemas.ts` (add a v8 fixture), tests.

Service API (`variantService.ts`):
```
createVariantGroup({name, sort_order?}) / updateVariantGroup / deleteVariantGroup(id)   // delete: variants keep existing with group_id=NULL (ON DELETE SET NULL); template slots referencing it are NOT touched here (compose falls back)
getAllVariantGroups()
getVariantsByGraphemeId(id): GraphemeVariantWithGlyphs[]      // default first, then sort_order
getDefaultVariantId(graphemeId)
createVariant(graphemeId, {name, group_id?, glyphs, sort_order?})  // glyphs.length ≥ 1; group uniqueness → clear error
updateVariant(id, {name?, group_id?})
setVariantGlyphs(id, glyphs)                                  // ≥ 1
setDefaultVariant(graphemeId, variantId)                      // two UPDATEs inside one transaction: clear old, set new (partial unique index!)
deleteVariant(id)                                             // refuses the default; calls lexiconService.handleVariantDeletion(id) FIRST
```
`graphemeService` changes: `createGrapheme` inserts the default variant then
routes `input.glyphs` to it and `input.variants` to new rows; `addGlyphToGrapheme`
/ `setGraphemeGlyphs` / `reorderGraphemeGlyphs` / `removeGlyphFromGrapheme`
operate on the DEFAULT variant (unchanged signatures, new optional `variantId`
last param); `loadGlyphsByGrapheme` / `getGlyphsByGraphemeId` join through the
default variant; `getAllGraphemesComplete` loads variants in ONE extra statement
(`loadVariantsByGrapheme`) — keep the "three statements regardless of count"
discipline: it becomes four; `getGraphemeComplete(id)` includes `variants`.
`deleteGrapheme` also deletes its variants (CASCADE covers it, but the explicit
delete order stays for the FK-off legacy path).

Export/import: add `variant_groups`, `grapheme_variants`, `block_scheme` to
`ExportTables`, `TABLE_INSERTION_ORDER` (`variant_groups` → … `graphemes` →
`grapheme_variants` → `grapheme_glyphs`), `AUTOINCREMENT_TABLES` (not
`block_scheme`), `INSERTABLE_TABLES`, `TABLE_SPECS` (`grapheme_glyphs.variant_id:
{type:'int?', default:null}` — see P4), `ALL_TABLES_CHILDREN_FIRST`. Add
`backfillDefaultVariants(db)` in `db/migrations/repair.ts` (creates a default
variant for any grapheme without one and points its NULL-variant glyph rows at
it); call it from migration v9 (instead of inline SQL), from `repairOrphans`,
and from `importExportData` after row insertion (so a v1–v3 envelope imports).

Tests (new `db/__tests__/variants.test.ts`, `db/__tests__/variantsExport.test.ts`,
extend `migrations.test.ts`, `repair.test.ts`, `spellingUtils`/`twoListArchitecture`):
- v8 fixture with 2 graphemes (one with 2 glyphs) migrates: each grapheme has one
  default variant, every glyph row has its variant id, positions preserved, FK
  check empty, second run applies nothing; fresh `createSchema` sqlite_master
  equals migrated sqlite_master for `grapheme_glyphs` (modulo whitespace).
- create grapheme → default variant exists; `GraphemeComplete.glyphs` unchanged
  in meaning (default variant); `variants[0].is_default`.
- add a second variant in group "head" using the SAME glyph at position 0 (this is
  the UNIQUE collision the rebuild exists for) → succeeds.
- one-variant-per-group is enforced with a clean error; deleting the group
  sets `group_id` NULL; deleting the default variant is refused; `setDefaultVariant`
  swaps atomically; deleting a non-default variant strips its pins from words.
- spellingUtils: `grapheme-12@34` parses; `grapheme-12@` and `grapheme-@34` are IPA;
  `extractGraphemeIds` ignores pins; `createGraphemeEntry(12, 34)`.
- export → import round-trip keeps variants and groups; importing a v3
  envelope (no variant tables) backfills defaults; `.sqlite` import of a v8 file
  migrates (reuse `importDatabaseFile`).
- `queryCount.test.ts` style: `getAllGraphemesComplete` is 4 statements.

### Phase 2 — Variants in the Script Maker  `[x]`

Files: `components/form/graphemeForm/GraphemeFormFields.tsx` (+scss),
`useGraphemeSubmit.ts`, new `components/form/graphemeForm/VariantsSection.tsx`,
new `components/tabs/grapheme/variantGroups/VariantGroupsDialog.tsx`,
`components/display/grapheme/{compact,detailed}/*`, `GraphemePickerModal`,
`GlyphKeyboardOverlay` (unchanged — shows default), `README.md`.

- The glyph section becomes **"Glyphs (default form)"**. Below it a
  **"Other forms"** section: one card per non-default variant (name, group
  `<select>` of the script's variant groups + "Manage groups…", its own
  `ReorderableList` of glyphs with the same draw/pick buttons, "Make default",
  "Remove"), and "Add a form". State: `variants: VariantDraft[]` owned by the
  page like `selectedGlyphs` is (NOT SmartForm fields — the glyph list never
  was either), reported via `onVariantsChange`.
- `useGraphemeSubmit`: create → `variants` in the request; edit → diff against
  `initialData.variants` (create / update name+group / setGlyphs / delete /
  setDefault) — each call checked, failures collected into the existing
  "saved, but not everything on it" warning. Deleting a variant that words pin
  needs a confirm ("N words pin this form; they will fall back to the default").
- `VariantGroupsDialog`: list, add, rename, delete (confirm shows how many
  variants use it). Reused by Phase 5.
- Detailed grapheme display: a row of variants (label = name · group), each a
  `GlyphSpellingDisplay glyphs={variant.glyphs} blockScheme={null}`.
  Compact card: default only, plus a small "+N forms" badge.
- Tests (`components/tabs/grapheme/__tests__/graphemeVariants.test.tsx`, happy-dom,
  real sql.js like `graphemeLogogramOption.test.tsx`): create with 2 forms →
  DB rows; edit renames/regroups/removes; make-default swaps; the default
  section never allows removing the last glyph.

### Phase 3 — Block scheme: storage + engine  `[x]`

Files: new `src/blocks/*` (§3), new `db/blockSchemeService.ts`
(`getBlockScheme()`, `saveBlockScheme(scheme)` → validate, single-row UPSERT),
`db/api/blockSchemeApi.ts` + `api/types.ts` + `api/index.ts`, context slice,
export/import of the `block_scheme` row (validate its JSON through
`validateBlockScheme` on import; a bad document imports as the default with a
report warning, never fails the import).

Tests (`src/blocks/__tests__/{validate,classify,segment,compose}.test.ts`,
`db/__tests__/blockScheme.test.ts`):
- validate: every rule in §2.4, including clamping and "no role twice".
- classify: `k` → phoneme C/P/O; `a` → V; `ka` → syllable; logogram → silent
  with category; `.` → boundary; separator role → structural; `[?12]` → unknown.
- segment: `C1 V C2` vs `C1 V` ordering ("first match wins"), boundary splits
  `kata` into `ka|ta` when `.` present, structural passthrough, unmatched →
  single, empty scheme → all singles, `enabled:false` handled by the CALLER
  (segment itself does not check `enabled`).
- compose: slot picks the group's variant, falls back with `missingGroup`,
  multi-glyph variant is combined, virtual entry rendered as text, output
  viewBox `0 0 100 100`, nested svg positions = rect × 100.
- service: save/get round-trip; get on a fresh DB = `EMPTY_BLOCK_SCHEME`;
  invalid JSON in the row → default + logged.

### Phase 4 — Blocks everywhere (rendering)  `[x]`

Files: `components/display/spelling/{types,utils/normalization,GlyphSpellingDisplay}.ts(x)`,
`hooks/useNormalizedGlyphs.ts`, new `db/context/useOptionalBlockScheme.ts`,
`components/tabs/grapheme/syllabaryChart/*` + `customCharts/CustomSyllabaryChart.tsx`
(empty cell preview), `components/display/spelling/README.md`.

- §4 wiring. The no-scheme path must be byte-identical (snapshot).
- Syllabary chart: an EMPTY cell (no grapheme whose phoneme is `ka`) shows a
  composed preview from `generateSpellingWithFallback('ka')` → entries, dimmed,
  with the title "Composed from k + a — click to create a dedicated sign";
  only when the scheme is enabled.
- The `.` boundary: verify what the fallback speller does with a pronunciation
  `ka.ta` (P6). If `.` is dropped by `buildSkipUnits`, preserve separator tokens
  as IPA entries `'.'` (they must NOT render when the scheme is on; when the
  scheme is off keep today's behaviour exactly, whatever it is — a test pins it).
- Tests: `components/display/spelling/__tests__/blocks.test.tsx` (happy-dom):
  provider with a scheme + 2 graphemes each with a "head" variant → the SVG
  contains one block `<svg>` with two nested slot svgs; pin `@` on the non-block
  path picks the variant; `blockScheme={null}` prop forces single glyphs;
  translator (`translatePhrase`) output composes across word separators without
  merging words; CompactLexiconDisplay renders a block for a CVC word.

### Phase 5 — Block Designer UI  `[x]`

Files: `url_mapping.ts` (`ROUTES.writingSystemBlocks`, TAB_ROUTES), `App.tsx`,
`components/tabs/writingSystem/{WritingSystemPage,WritingSystemNav}.tsx`, new
`components/tabs/writingSystem/blocks/{BlocksPage,RolesEditor,TemplateList,TemplateEditor,RectLayoutEditor,BlockPreview,seedFromGenerator}.tsx|ts` + scss,
`rules/validateWritingSystem.ts` (a warning when the scheme is enabled with
zero templates).

- Writing System gets a sub-nav: **Direction** (today's page) · **Blocks**.
- Blocks page layout (top to bottom): enable toggle + status line
  ("3 roles · 4 templates · 2 variant groups"); **Roles** (table: label, matcher
  select — consonant/vowel/…/syllable sign/category(text)/anything — colour
  chip, delete with "used by N templates" guard); **Variant groups** (opens
  `VariantGroupsDialog` from Phase 2); **Templates** (reorderable list — order
  IS priority, hint text says so; each row: name, pattern chips, thumbnail,
  Edit/Duplicate/Delete).
- `TemplateEditor` (a page section, not a modal): name; pattern built by
  clicking role chips (a role can be added once); the **layout canvas**
  (`RectLayoutEditor`): a square with one rectangle per pattern role, drag to
  move, corner handle to resize, snapping to 1/8 toggle, arrow keys move /
  shift+arrows resize the focused rectangle (accessibility), each rectangle
  shows its role label + a group `<select>`; **live preview** on the right:
  pick a real word from the lexicon (or type IPA) and see `GlyphSpellingDisplay`
  of the DRAFT scheme (pass `blockScheme={draft}`) so the user sees actual
  glyphs move as they drag. Save writes the whole scheme via
  `api.blockScheme.save`; validation issues shown inline.
- `seedFromGenerator`: "Add templates from my word shapes" → reads
  `settings.wordGenerator.profile.syllables` patterns, `parseTemplate` each,
  expands optional items into with/without patterns, maps class letters to
  roles (creating `C`, `V`, … roles with `{kind:'class'}` matchers when missing;
  a repeated letter becomes `C1`, `C2`), lays slots out in an even row
  (`x = k/n, w = 1/n, y = 0, h = 1`) so the user has something to drag. Skips
  patterns that already exist by pattern equality.
- No new dependency: `RectLayoutEditor` is pointer events + a `useRef` for the
  drag origin; ~150 lines. Check `packages/cyber-components/COMPONENT_DIRECTORY.md`
  for Tabs/SubNav, Select, Modal, ReorderableList, Button and use them.
- Tests (`components/tabs/writingSystem/__tests__/blocksPage.test.tsx`, happy-dom):
  add a role, add a template with pattern C1 V, save → DB row validates;
  reorder templates → order persisted; enable with no templates → warning;
  `RectLayoutEditor` unit test: keyboard moves/resizes and clamps to [0,1];
  seedFromGenerator on the "island" preset yields ≥ 2 templates and no
  duplicates on a second run.

### Phase 6 — Word form: blocks while spelling  `[x]`

Files: `components/form/customInput/glyphCanvasInput/{GlyphCanvasInput,GlyphCanvas}.tsx`,
new `BlockPreviewStrip.tsx`, new `BlockPopover.tsx`, `utils/*`, README;
`components/form/lexiconForm/LexiconFormFields.tsx`.

- When the scheme is enabled the canvas stays ENTRY-based (cursor, insert,
  delete are unchanged) and gains: a thin coloured outline grouping the tiles
  of each block (colour from the template's first role), and a **preview strip**
  above the tiles rendering the composed word with `GlyphSpellingDisplay`
  (this is what the word will look like everywhere else).
- Clicking a block outline (or a "Block…" button on the focused tile) opens
  `BlockPopover`: template name, each slot → grapheme name + variant `<select>`
  ("Auto (head)", then every variant of that grapheme); choosing writes a pin
  (`grapheme-12@34`) into the entry; "Auto" strips it. A second section lists
  other templates whose pattern matches — choosing one inserts a boundary
  `.` where needed is OUT of scope; instead "Split here" inserts a `.` entry
  after the focused tile and "Join" removes an adjacent `.`.
- `.` entries: rendered on the canvas as a slim boundary tile (like the space
  tile from the keyboard work), never as a text glyph; the keyboard gets a
  "·" boundary key next to Space when the scheme is enabled.
- Under the auto-spell lock: preview strip still shows blocks; popover is
  read-only (pins are a manual-spelling thing — the lock tooltip explains).
- Tests (`glyphCanvasInput/__tests__/blocks.test.tsx`, happy-dom): outlines
  group correctly for `C1 V C2`; pin via popover changes the hidden input to
  `grapheme-1@7`; Auto strips it; Split inserts `.`; the lock makes the
  popover read-only; with the scheme disabled none of this UI mounts.

### Phase 7 — Final audit  `[x]`

- Full etymolog suite, typecheck diff, lint on touched files.
- Live check in Claude-in-Chrome (`alpha-etymolog`, http://localhost:5178/etymolog/):
  make groups "head"/"body", a grapheme with two forms, a scheme with `C1 V`
  and `C1 V C2`, a word `kat`, check the card, the translator and the form.
- READMEs: `apps/etymolog/README.md` (new "Block script" section: model,
  designer, pins, boundaries, limitations), `glyphCanvasInput/README.md`,
  `display/spelling/README.md`.
- `todo.md`: anything needing a human.

## 6. Pitfalls (read before touching anything)

- **P1 — `grapheme_glyphs` UNIQUE.** `UNIQUE(grapheme_id, glyph_id, position)`
  makes a second variant that reuses a glyph at the same position IMPOSSIBLE.
  The migration rebuilds the table (copy the v6/v7 recipe: `foreignKeysOff: true`,
  `_new` table, `INSERT … SELECT`, `DROP`, `RENAME`, recreate indexes, end with
  `PRAGMA foreign_key_check`). `createSchema` must emit the SAME DDL via a shared
  `createGraphemeGlyphsTable(db)` so fresh and migrated `sqlite_master` match —
  `migrations.test.ts` compares them.
- **P2 — Partial unique index + swapping the default.** `setDefaultVariant` must
  clear the old default BEFORE setting the new one, in one transaction.
- **P3 — `GraphemeComplete.glyphs` keeps its meaning.** Dozens of renderers and
  the auto-speller consume it. It is the DEFAULT variant's glyphs, always. Add
  `variants`, never change `glyphs`.
- **P4 — Old envelopes.** A v1–v3 JSON export has no variant tables and no
  `variant_id`. Import must succeed: `variant_id` is `int?` in the spec, and
  `backfillDefaultVariants` runs after insertion. Same helper serves migration
  v9 and `repairOrphans`. Bump `EXPORT_SCHEMA_VERSION` to 4 and make sure
  `parseAndValidateJson` still accepts 1–4.
- **P5 — Tests build `GraphemeComplete` literals everywhere.** Keep `variants`
  optional on the TYPE. Any code that reads `grapheme.variants` must treat
  `undefined` as "default only".
- **P6 — The `.` boundary and the speller.** `buildSkipUnits` in
  `autoSpellService.ts` tokenizes unmatched text with `tokenizeIpa`; a
  separator token may be dropped or emitted as a virtual glyph. Write the test
  FIRST, then decide. When the scheme is OFF, today's behaviour must not change.
- **P7 — Do not thread `blockScheme` through every call site.** Read it from
  context inside `GlyphSpellingDisplay` (optional hook, null outside the
  provider). The prop is an override, not the transport.
- **P8 — React compiler memo rules in this codebase.** Read the comments in
  `GlyphSpellingDisplay.tsx` / `useNormalizedGlyphs.ts`: optional-chained deps
  and member-expression deps break memoization. Read values out of objects
  first; depend on whole objects the caller already memoizes.
- **P9 — SmartForm registers fields on every render** (see the header comment
  of `GraphemeFormFields.tsx`). Variants are page state like `selectedGlyphs`,
  not SmartForm fields. Do not cache `registerField` results.
- **P10 — `packages/*` are junctions to MAIN** in this worktree for tests run
  by OTHER packages; the etymolog vitest/vite config aliases `cyber-components`
  and `smart-form` to the worktree. Prefer not to edit `packages/*` in this
  epic at all; everything needed exists (ReorderableList, Modal, Select, Button).
- **P11 — Respell.** `deriveAutoSpelledGlyphOrder` emits plain entries. Never
  add pins there. `respellAutoSpelledWords` therefore erases pins on
  auto-spelled words — that is correct and documented.
- **P12 — Query-count discipline.** `queryCount.test.ts` pins statement counts
  for the bulk loaders. Load variants for all graphemes in ONE statement.
- **P13 — `handleGraphemeDeletion` / `replaceGraphemeWithIpa` etc.** operate on
  raw entry strings. After the regex change they must match `grapheme-12@34`
  too. `twoListArchitecture.test.ts` and `spellingSourceOfTruth.test.ts` are the
  guards — extend them.
- **P14 — Typecheck baseline is 37 pre-existing errors.** Diff by (file, code);
  a phase that adds a test file must re-run typecheck afterwards.
- **P15 — Never `git add -A`, never run a non-frozen `pnpm install`, never
  `pnpm ci:full`.** Agents do not commit; the coordinator commits after audit.
