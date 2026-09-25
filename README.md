# Etymolog

A conlang (constructed language) script creation and management tool. Create custom writing systems with glyphs, graphemes, and their associated phonemes (pronunciations).

## Table of Contents
- [Quick Start](#quick-start)
- [Global Settings](#global-settings-new)
- [Use Cases & Requirements](#use-cases--requirements)
- [Application Architecture](#application-architecture)
- [Data Layer](#data-layer)
- [Block script (abugida / Mayan-style glyph blocks)](#block-script-abugida--mayan-style-glyph-blocks)
- [Route Structure](#route-structure)
- [Design System (tokens & shared primitives)](#design-system-tokens--shared-primitives)
- [App shell](#app-shell-srccomponentsshell)
- [Component Architecture](#component-architecture)
- [Folders & the inline tree explorer](#folders--the-inline-tree-explorer)
- [Auto-Manage Glyphs](#auto-manage-glyphs-feature)
- [Punctuation & Separators](#punctuation--separators-new)
- [Word generator](#word-generator-new)
- [Testing](#testing)
- [Development](#development)
- [Known Issues](#known-issues)
- [Deployment (GitHub Pages)](#deployment-github-pages)
- [Architecture Notes](#architecture-notes)

---

## Quick Start

### Using the Etymolog Context (Recommended)

The app uses a **two-layer virtual frontend/backend architecture**. All UI components access data through the `useEtymolog()` hook:

```tsx
import { EtymologProvider, useEtymolog } from './db';

// 1. Wrap your app with the provider
function App() {
  return (
    <EtymologProvider>
      <YourApp />
    </EtymologProvider>
  );
}

// 2. Use the hook in any component
function GlyphGallery() {
  const { api, data, settings, isLoading, error } = useEtymolog();
  
  if (isLoading) return <Spinner />;
  if (error) return <Error message={error.message} />;
  
  // Read data reactively
  const { glyphs, graphemesComplete, glyphCount } = data;
  
  // Perform operations via the API
  const handleCreate = () => {
    const result = api.glyph.create({
      name: 'New Glyph',
      svg_data: '<svg>...</svg>'
    });
    // Data auto-refreshes after mutations
  };
  
  // Access or update settings
  const { simpleScriptSystem } = settings;
  api.settings.update({ simpleScriptSystem: true });
  
  return <div>{/* Your UI */}</div>;
}
```

---

## Global Settings (new)

Etymolog stores a small set of global settings that affect UI behavior and translation features. These are kept in browser storage under the key `etymolog_settings_v1` (localStorage) and are exposed through the API and `useEtymolog()` context.

Key points:
- Storage location: localStorage (key `etymolog_settings_v1`). Future work may migrate some settings to per-conlang SQLite storage.
- Access/update: use `const { api, settings } = useEtymolog();` then read `settings` or call `api.settings.update({ ... })` to persist changes.

Important settings (examples):
- `autoManageGlyphs` (boolean) — when true, orphan glyphs may be removed automatically.
- `defaultGalleryView` (`compact | detailed | expanded`) — default gallery UI mode.
- `punctuation` (object) — new: configuration for word separators, sentence endings, and common punctuation marks. See "Punctuation & Separators" below.
- `wordGenerator` (object) — new: `{ profile, guidePresetId }`, the word generator's phonotactic profile and the flavour the IPA chart paints. See "Word generator" below. Like every settings key it rides in the JSON/PNG export envelope and NOT in a raw `.sqlite` export.
- `customCharts` (array) — user-defined charts.

Example: update settings from a component

```tsx
const { api, settings } = useEtymolog();

// Toggle auto-manage glyphs
api.settings.update({ autoManageGlyphs: !settings.autoManageGlyphs });

// Update punctuation settings (partial update)
const newPunc = { ...settings.punctuation, wordSeparator: { graphemeId: null, useNoGlyph: true } };
api.settings.update({ punctuation: newPunc });
```

How the translator uses settings
- The Phrase Translator now reads punctuation settings so word separators and sentence endings can be rendered with assigned graphemes, virtual glyphs, or hidden entirely. The translation API accepts the punctuation settings when invoked: `api.phrase.translate(phrase, settings.punctuation)`.

---

## Use Cases & Requirements

### Primary Use Cases

| Use Case | Description | Primary Route | Status |
|----------|-------------|---------------|--------|
| **UC1: Create Glyph** | Draw and save an atomic visual symbol | `/script-maker/glyphs/create` or modal in grapheme form |  Complete |
| **UC2: Browse Glyphs** | View all saved glyphs in a searchable gallery with usage counts | `/script-maker/glyphs` |  Complete |
| **UC3: Edit Glyph** | Modify an existing glyph's drawing, name, or metadata | `/script-maker/glyphs/db/:id` |  Complete |
| **UC4: Delete Glyph** | Remove a glyph (with protection if in use, or force/cascade delete) | Gallery or edit page |  Complete |
| **UC5: Create Grapheme** | Compose glyphs into a written character with pronunciations | `/script-maker/create` |  Complete |
| **UC6: Browse Graphemes** | View all graphemes in a searchable gallery | `/script-maker` |  Complete |
| **UC7: Edit Grapheme** | Modify grapheme composition, metadata, or pronunciations | `/script-maker/grapheme/db/:id` |  Complete |
| **UC8: Delete Grapheme** | Remove a grapheme (cascades to phonemes) | Gallery or edit page |  Complete |
| **UC9: Manage Pronunciations** | Add, edit, or remove phonemes for a grapheme | Within grapheme forms |  Complete |
| **UC10: Import/Export** | Save/load the entire database as SQLite file | Future/settings |  Planned |
| **UC11: Auto-Manage Glyphs** | Automatically delete orphaned glyphs when no longer used | Settings toggle in glyph gallery |  Complete |
| **UC12: Create Lexicon Entry** | Add vocabulary with lemma, pronunciation, meaning, spelling | `/lexicon/create` |  Complete |
| **UC13: Browse Lexicon** | View all words in searchable gallery with filters | `/lexicon` |  Complete |
| **UC14: Edit Lexicon Entry** | Modify word details, spelling, ancestry | `/lexicon/view/:id` |  Complete |
| **UC15: Delete Lexicon Entry** | Remove a word (protected if referenced as ancestor) | Gallery or edit page |  Complete |
| **UC16: View Etymology Tree** | Display recursive ancestry from any word to its roots | `/lexicon/view/:id` |  Complete |
| **UC17: Auto-Spell Word** | Generate spelling from pronunciation using grapheme phonemes | Within lexicon forms |  Complete |
| **UC18: External References** | Mark words as non-native for borrowed/ancestor words | Within lexicon forms |  Complete |
| **UC26: View IPA Chart** | Display interactive IPA consonant and vowel charts | `/script-maker/chart` |  Complete |
| **UC27: Create Grapheme from IPA** | Click unassigned IPA to create grapheme with pre-filled phoneme | IPA Chart 192 Create page |  Complete |
| **UC28: Edit Grapheme from IPA Chart** | Click assigned IPA cell to navigate to grapheme edit page | IPA Chart 192 Edit page |  Complete |
| **UC29: Configure Punctuation** | Assign custom graphemes to punctuation marks and separators | `/script-maker/punctuation` |  Complete |

### Secondary Use Cases

| Use Case | Description | Status |
|----------|-------------|--------|
| **UC19: Configure Settings** | Toggle autoManageGlyphs, set gallery view preferences | Toolbar toggle | ✅ Complete |
| **UC20: Graphotactic Rules** | Define valid grapheme sequences | `/graphotactic` | 🚧 Placeholder |
| **UC21: Part of Speech** | Manage grammatical categories | `/part-of-speech` | 🚧 Placeholder |
| **UC22: Search & Filter** | Search glyphs/graphemes/lexicon by name, sort by various criteria | All galleries | ✅ Complete |
| **UC23: Canvas-Based Glyph Input** | Select glyphs on a pannable canvas with keyboard overlay | Custom input component | ✅ Complete |
| **UC24: Writing Direction Support** | Configure LTR, RTL, TTB, BTT for glyph sequences | GlyphCanvasInput direction prop | ✅ Complete |
| **UC25: Modular Insertion Strategies** | Pluggable strategies for glyph insertion (append, prepend, cursor) | Strategy pattern | ✅ Complete |

### Functional Requirements

| ID | Requirement | Implementation | Status |
|----|-------------|----------------|--------|
| **FR1** | Users can draw SVG glyphs using pen, shapes, and selection tools | `ScriptDrawer` component in grapheme forms | ✅ Implemented |
| **FR2** | Glyphs are reusable across multiple graphemes | Junction table `grapheme_glyphs` with ON DELETE RESTRICT | ✅ Implemented |
| **FR3** | Graphemes can contain ordered sequences of glyphs | `position` field in `grapheme_glyphs` table | ✅ Implemented |
| **FR4** | Each grapheme can have multiple phonemes (pronunciations) | One-to-many relationship in `phonemes` table | ✅ Implemented |
| **FR5** | Phonemes can be marked for auto-spelling feature | `use_in_auto_spelling` boolean field | ✅ Implemented |
| **FR6** | Glyphs in use cannot be deleted without explicit force | `deleteGlyph()` checks usage count, `forceDelete()` and `cascadeDelete()` for override | ✅ Implemented |
| **FR7** | All data persists locally via SQL.js + localStorage | `persistDatabase()` called after mutations, key: `etymolog_db_v3` | ✅ Implemented |
| **FR8** | Forms support real-time validation | SmartForm package with field-level validators | ✅ Implemented |
| **FR9** | Galleries support search, sort, and pagination | DataGallery component with search/filter/sort props | ✅ Implemented |
| **FR10** | Inline glyph editing within grapheme forms | `NewGlyphModal` and `EditGlyphModal` components | ✅ Implemented |
| **FR11** | Auto-manage orphaned glyphs setting (toggleable) | `autoManageGlyphs` setting with `cleanupOrphanedGlyphs()` on grapheme delete/update | ✅ Implemented |
| **FR12** | Lexicon entries store lemma, pronunciation, meaning | `lexicon` table with lemma, pronunciation, meaning columns | ✅ Implemented |
| **FR13** | Lexicon entries can have ordered grapheme spelling | Junction table `lexicon_spelling` with `position` field | ✅ Implemented |
| **FR14** | Lexicon entries track etymological ancestry | Self-referential junction table `lexicon_ancestry` | ✅ Implemented |
| **FR15** | Auto-spelling generates graphemes from pronunciation | `autoSpellService` with DP optimal-match algorithm | ✅ Implemented |
| **FR16** | External/borrowed words marked with is_native flag | `is_native` boolean field in `lexicon` table | ✅ Implemented |
| **FR17** | Recursive ancestry queries (full etymology tree) | Recursive CTE queries in `lexiconService` | ✅ Implemented |
| **FR18** | Cycle detection prevents circular ancestry | `wouldCreateCycle()` validation before ancestry updates | ✅ Implemented |
| **FR19** | Deleting ancestor removes relationship, not descendant | `ON DELETE SET NULL` on `ancestor_id` foreign key | ✅ Implemented |
| **FR20** | IPA Consonant Chart displays place × manner grid | `IPAConsonantChart` with voiceless/voiced pairs | ✅ Implemented |
| **FR21** | IPA Vowel Chart displays height × backness trapezoid | `IPAVowelChart` with SVG positioning | ✅ Implemented |
| **FR22** | Phoneme-to-grapheme lookup for IPA chart | `getPhonemeMap()` API method for bulk lookup | ✅ Implemented |
| **FR23** | Grapheme glyphs display in IPA chart cells | Reuses `GlyphSpellingDisplay` component | ✅ Implemented |
| **FR24** | Pre-fill phoneme when creating from IPA chart | URL param `?phoneme=X` read by create form | ✅ Implemented |
| **FR25** | Customizable punctuation and word separators | `PunctuationSettings` in global settings, `phraseService` integration | ✅ Implemented |
| **FR26** | Auto-spelled words are regenerated when the script changes (grapheme created/deleted, phoneme added/edited/removed) | `respellService` — narrow `instr()` candidate scan + DP regeneration, triggered from every phoneme write in `graphemeApi` | ✅ Implemented |

### Non-Functional Requirements

| ID | Requirement | Implementation |
|----|-------------|----------------|
| **NFR1** | Modularity | Form fields extracted to reusable components |
| **NFR2** | Performance | Memoization, virtualization in galleries |
| **NFR3** | Accessibility | ARIA attributes, keyboard navigation |
| **NFR4** | Maintainability | Two-layer architecture, typed APIs |
| **NFR5** | Testability | 141 test cases covering services |

---

## Application Architecture

### High-Level Overview

```
App.tsx
└─ ProcessingLockModalProvider → EtymologProvider
   └─ NotificationProvider → ConfirmDialogProvider    (above <Routes>, so /new
      └─ <Routes>                                      shares both surfaces)
         ├─ /new                 → NewConlangPage       (outside the shell)
         └─ layout route         → ConlangGuard > AppShell
            ├─ index             → Navigate to /lexicon
            ├─ lexicon/*        → LexiconMain
            ├─ script-maker/*   → GraphemeMain
            ├─ writing-system/* → WritingSystemMain
            └─ translator/*     → TranslatorMain

AppShell
├─ skip link → #main-content
├─ PwaUpdateGate           renders nothing; dirty probe + route-change apply
├─ AppHeader    <header>   h1 = conlang name, rename, Export, Import,
│                         New conlang (danger confirm), DarkmodeSwitch
├─ ShellStatusBanner       persistence / health, mounted once
├─ AppNav       <nav aria-label="Primary">  TabContainer, four tabs
│  └─ panel → BasicBody → <main id="main-content"> → <Outlet/>
└─ AppFooter    <footer>   build stamp, save status, author
```

### Tab Sections

The four entries come from `TAB_ROUTES` in `src/url_mapping.ts` — the single
source for the nav strip, the route tree and the active-tab derivation
(`activeTabId(pathname)`).

| Tab | Path | Description |
|-----|------|-------------|
| Lexicon | `/lexicon` | Word/vocabulary management, plus the **word generator** (`/lexicon/generate`) |
| Script Maker | `/script-maker` | Grapheme & glyph management (nested Graphemes / Glyphs strip) |
| Writing System | `/writing-system` | Directional layout rules (**Direction**) and the block-script designer (**Blocks**, `/writing-system/blocks`) |
| Translator | `/translator` | Phrase translation and rendering |

---

## Data Layer

Everything below `src/db/` is the app's "backend". The UI never touches sql.js:
it calls `api.*` through `useEtymolog()`, and the API calls services, and the
services own the SQL.

```
UI component → useEtymolog() → EtymologApi → service → withTransaction → sql.js
                                                              ↓ (on outer commit)
                                                      schedulePersist()
                                                              ↓ 300 ms debounce
                                                      DbStorageAdapter.save()
```

### Persistence — `src/db/persistence/`

sql.js keeps the whole database in memory; durability is entirely this module's
job.

| File | Responsibility |
|---|---|
| `types.ts` | `DbStorageAdapter` (`load` / `loadPrevious` / `save` / `clear`), `StoredDb`, `PersistenceState` |
| `indexedDbAdapter.ts` | Primary store. DB `etymolog`, object store `database`, keys `current` / `previous`; one readwrite transaction rotates `current → previous` and writes the new `current` |
| `localStorageAdapter.ts` | Fallback. base64 + CRC-32 under the historical keys, with a `bytes × 4/3 > 4.5 MB` pre-check that raises `QUOTA` **before** attempting the write |
| `memoryAdapter.ts` | Test adapter — neither Node nor happy-dom provides IndexedDB, so tests inject this through `configurePersistence()` |
| `selectAdapter.ts` | IndexedDB if it opens (private-mode browsers throw), else localStorage. Migrates a localStorage database into IndexedDB once, and removes the localStorage copy only **after** the first successful IndexedDB save |
| `scheduler.ts` | `schedulePersist()` (300 ms trailing debounce), `persistDatabaseNow()` (flush), `subscribePersistence()`, `getPersistenceState()`. Flushes on `pagehide` and `visibilitychange(hidden)`; a failed save keeps the dirty flag so the next schedule retries |

Two invariants this module exists to hold:

- **`Database.export()` closes and reopens the sql.js connection.** It frees
  every statement, `sqlite3_close_v2`s, reads the file back and reopens — which
  silently resets `PRAGMA foreign_keys` to OFF and rolls back any open
  transaction. Only `exportDatabaseBytes()` may call it: it re-applies the
  connection pragmas afterwards and throws if `getTransactionDepth() > 0`.
- **Nothing is thrown away.** Boot verifies the CRC of `current`; on a mismatch
  it loads `previous` and reports `restoredFromBackup`; only if both fail does
  it create a fresh database, and the bad bytes are kept under `previous`.

The footer's save indicator and the shell's storage banner both read
`subscribePersistence()`, so "Saving / Saved / Unsaved changes", `QUOTA`,
`UNAVAILABLE` and `WRITE_FAILED` are visible rather than console-only. The
indicator names the adapter in use, because a browser silently on the
localStorage fallback has a ~4 MB ceiling.

### Transactions — `src/db/utils/transaction.ts`

`withTransaction(db, fn)` is the ONLY way a service writes. It keeps a depth
counter: depth 0 issues `BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK`, depth > 0
issues `SAVEPOINT sp_<n>` / `RELEASE` / `ROLLBACK TO`. Nesting is not optional —
`BEGIN` inside `BEGIN` throws in SQLite, and services legitimately nest
(`createLexicon` → `addAncestorToLexicon`).

Two consequences worth knowing before adding a service method:

- **`schedulePersist()` fires once, on the OUTERMOST commit.** No service calls
  `persistDatabase()` any more; a multi-statement operation produces one save,
  and a rolled-back operation produces none.
- **`PRAGMA foreign_keys` is a no-op inside a transaction.** A migration that
  rebuilds a table toggles it outside `BEGIN` and runs `PRAGMA foreign_key_check`
  after `COMMIT`.

### Schema and migrations — `src/db/migrations/`

`PRAGMA user_version` is the source of truth; the registry, the legacy
detector, the per-version table and the repair path are documented under
[Database migrations](#database-migrations). The current version is **9**:
v9 added `variant_groups`, `grapheme_variants` and the single-row
`block_scheme`, and rebuilt `grapheme_glyphs` keyed on `variant_id`, with every
existing glyph row attached to its grapheme's new 'Default' variant — the
storage of the [block script](#block-script-abugida--mayan-style-glyph-blocks).

### One spelling source of truth

`lexicon.glyph_order` (a JSON array of `grapheme-<id>` entries and bare IPA
characters) **is** a word's spelling. Since schema v9 a grapheme entry may pin
one of the grapheme's forms, `grapheme-<id>@<variantId>` (`grapheme-12@34`):
`GRAPHEME_ENTRY_RE` in `db/utils/spellingUtils.ts` is the single parser, the
index below records such an entry as plain grapheme 12, and pins exist only in
manual spellings (see [Pins](#pins--grapheme-1234)). The `lexicon_spelling`
junction table is a derived index, resynced from `glyph_order` inside the same
transaction:

- `setLexiconSpelling` sorts by position, converts to `glyph_order` entries and
  delegates to `setLexiconGlyphOrder`;
- `addSpellingToLexicon` appends to `glyph_order`;
- `applyAutoSpelling` converts `AutoSpellResultExtended.spelling` (virtual → the
  IPA character, real → `grapheme-<id>`) and takes the same path.

The junction gets **one row per occurrence** at its true index — the
`UNIQUE(lexicon_id, grapheme_id, position)` constraint permits that — so a word
that uses the same grapheme twice keeps both positions. Before this, two writers
disagreed about which table was authoritative and the displayed spelling
depended on which one a query happened to read.

**The auto-spell fallback invents one virtual glyph per SOUND, not per code
point.** When no grapheme matches, `generateSpellingWithFallback` skips a whole
IPA token (`tokenizeIpa`), so an affricate `t͡s` is a single placeholder instead
of three (`t`, the tie bar, `s`) and a long vowel `aː` a single one instead of
two — visible in the word form's auto-spell and in the generator's spelling
preview alike. Real graphemes still match against the raw pronunciation, so a
grapheme whose phoneme is `t͡s` still wins over the fallback; an untied `tʃ`
stays two tokens (the tokenizer's documented conservative reading); and
separators (`ˈ ˌ . ‿` and spaces) keep their existing one-entry-each behaviour
rather than being dropped, which would silently merge a two-word pronunciation.

### Logograms (whole-word symbols) — `src/db/wordSymbolService.ts`

A logographic author wants to spell a whole word as ONE symbol, without visiting
the Script Maker at all. A **logogram** (the service still calls it a "word
symbol") is exactly that: a single symbol that IS the word. Under the hood it is still an ordinary
glyph → grapheme pair — a `'logogram'`-category grapheme holding one glyph — so
every downstream surface (spelling render, delete flow, export/import, repair)
treats it like any other grapheme with no special case. What marks a word as a
symbol word is only that its `glyph_order` is exactly that one grapheme and its
category is `'logogram'`; `wordSymbolGraphemeId()` recognises that pair so the
word form can reopen the word in **Symbol mode**.

- `createWordSymbol({ name, svgData })` makes the glyph + grapheme in ONE
  transaction (both stamped `'logogram'`, glyph linked at position 0) and
  returns their ids. The SVG is sanitised by the glyph service on the way in.
- `createWordSymbol({ name, glyphId })` / `logogramForGlyph(glyphId, name)` use
  an EXISTING glyph instead: nothing is drawn or copied; the glyph is wrapped in
  a logogram grapheme — or the phoneme-less, single-glyph logogram grapheme that
  already wraps it is REUSED, so picking the same glyph for two words gives one
  shared logogram, not duplicates. Exactly one source (drawing or glyph).
- `updateWordSymbolDrawing(graphemeId, svgData)` re-draws the grapheme's single
  glyph.
- `api.wordSymbol.{create,updateDrawing}` wrap both in the standard
  `ApiResponse` envelope.
- **Composite create**: `CreateLexiconInput.symbol = { name?, svgData? , glyphId? }`. When
  present AND no explicit `glyph_order`/`spelling` was given, `lexicon.create`
  creates the symbol and sets `glyph_order` to that one grapheme **inside the
  same transaction as the word insert** — a failure anywhere (a bad meaning, a
  dangling ancestor FK) rolls the whole thing back, so no orphan glyph/grapheme
  survives. The symbol name defaults to the word's display name (pronunciation,
  else first meaning). Symbol words are forced `auto_spell = 0`.
- A logogram grapheme carries **no phonemes**, so it is invisible to the
  IPA/syllabary charts by construction, and — being `auto_spell = 0` — a symbol
  word is never a respell candidate, so a phoneme/grapheme edit can never rewrite
  a hand-placed logograph.
- Deleting the word leaves the grapheme (a reusable script unit); deleting the
  grapheme via the Script Maker runs the usual `handleGraphemeDeletion` flow and
  flags the (manually spelled) word for attention.

The word form's Spelling section offers a **Compose from graphemes | Logogram**
segmented choice (`LexiconFormFields`). Compose is the default; edit mode INFERS
Logogram mode (with that grapheme chosen) from a one-logogram `glyph_order`.
Logogram mode is `LogogramPanel` — a dedicated front end over the same system:

| Sub-tab | What the user does | What is saved |
|---------|--------------------|---------------|
| **Use existing → Choose a grapheme…** | picks from `GraphemePickerModal` (the Script Maker gallery in selection mode, on its "Word symbols" filter first; `hideMarks` keeps marks out) | `glyph_order = ["grapheme-<id>"]` — referenced, nothing created |
| **Use existing → Choose a glyph…** | picks from `GlyphPickerModal` | `symbol.glyphId` → the glyph's logogram grapheme (reused or created) |
| **Draw new** | draws in `SvgDrawerInput` or imports an image | `symbol.svgData` → a NEW glyph + logogram grapheme named after the word |

The chosen logogram shows as a card (its symbol, what it is, how many OTHER
words share it) with **Change**, **Edit in Script Maker** and **Remove**. A new
drawing on an existing logogram word makes a NEW logogram — the shared one is
never re-drawn in place from the word form (other words may use it); its artwork
is edited in the Script Maker, which changes every word that uses it. Logogram
mode forces auto-spell off.

The Script Maker's grapheme form has the matching option: **"No sound"**
(`GraphemeFormFields`, `initialIsLogogram`). The data
model never required a grapheme to have a pronunciation (phonemes are a separate,
optional table); only the form did. With the option on, the pronunciation table
is hidden (kept mounted — it is a registered SmartForm field) and not required,
and `useGraphemeSubmit({ isLogogram })` saves NO phonemes.

A no-sound grapheme is one of two KINDS, chosen with the radios **"What kind of
sign is it?"** right under the checkbox (`logogramOption.ts`):

| Kind | Category | Offered by |
|------|----------|------------|
| **A word symbol (logogram)** — stands for a whole word or idea (default) | `WORD_SYMBOL_CATEGORY` = `'logogram'` | the word form's Logogram tab |
| **A mark** — added to other signs (a vowel-killer, an accent); never used on its own in auto-spelling | `MARK_CATEGORY` = `'mark'` (`wordSymbolService.ts`) | Writing System → Blocks, "Consonants with no vowel" |

Only the category tells them apart. Ticking "No sound" or picking a kind stamps
that kind's category — but only over an EMPTY category or the OTHER kind's
constant (`categoryForNoSoundKind`), never over one the user typed; on edit
the radios start on "A mark" when the stored category is `'mark'`
(`initialNoSoundKind`). `isMarkGrapheme(g)` is `category === 'mark'`;
`isLogogramGrapheme(g)` is `category === 'logogram'` or no phonemes, EXCLUDING
marks. `GraphemePickerModal` filters by kind — **Word symbols / Marks / All**
(a filter whose list is empty is hidden; All always shows; an empty asked-for
filter falls back to All) — and `hideMarks` leaves marks out entirely (the
Logogram tab). The Blocks page's vowel-killer chooser opens it on Marks when
the script has any, else Word symbols, else All; any grapheme may still be
chosen.

### Word chains — build a compound's spelling from its ancestors (UC-B2)

A logographic word is often a chain of other words: "boredom" is `night` +
`affliction`. When a word has ≥1 ancestor and the Spelling section is in Compose
mode, `LexiconFormFields` shows a **"Build spelling from ancestors"** button that
concatenates each ancestor's stored `glyph_order` — in **ancestry position
order** (the order of the ancestor rows) — onto this word's canvas. That is the
four-click flow: add two ancestors (type `compound`), press Build, save; no visit
to the Script Maker.

- The canvas content is replaced through the spelling input's imperative
  `setGlyphOrder` handle (`GlyphCanvasInputRef`), so the build flows back up the
  same path a manual edit does (dirtying the form, updating `glyph_order`).
- **The concatenated entries REFERENCE the ancestors' graphemes — they are not
  copied.** A later edit to `night`'s symbol therefore updates every compound
  that was built from it automatically, which is exactly the desirable
  logographic behaviour. IPA fallback entries in an ancestor's spelling carry
  over verbatim.
- Ancestors whose spelling is empty contribute nothing; when **every** ancestor
  is empty the button is disabled with an inline hint. Replacing a non-empty
  canvas is confirmed first (a `useConfirm` dialog, `tone: 'danger'`).

### Auto-spelled words follow the script — `src/db/respellService.ts`

A word with `auto_spell` on has a **derived** spelling: whatever the speller
produces for its pronunciation against the graphemes that exist *now*. That
derivation used to run exactly once, when the word was saved, so creating a
grapheme for a sound twenty words were already using left all twenty showing
the IPA placeholder, and editing a grapheme's phoneme silently made every word
spelled with it wrong.

**One derivation, everywhere.** `deriveAutoSpelledGlyphOrder(pronunciation)` is
THE function: the respell pass uses it, and so do `lexicon.create` and
`lexicon.update` — an auto-spelled word's `glyph_order` is derived on save and
the one the caller sent is ignored (a word with no pronunciation keeps its
spelling, exactly as the respell scan skips it). Before, save stored whatever the
form sent, so a hand edit made while auto-spell was on looked saved and was
silently respelled away by the next grapheme change.

**In the word form the software visibly owns the spelling.** The wand in the
Spelling header IS the `auto_spell` boolean — a toggle ("Auto-spell on/off"),
not a one-shot "generate + Apply" button — and there is no separate checkbox.
While it is on, `GlyphCanvasInput` gets `locked={{ glyphOrder, message, tooltip }}`:
the canvas shows the live derived spelling (it follows the pronunciation as it is
typed and the script as graphemes change), greyed and read-only, with a visible
notice and the hover text "Disable auto-spell to modify the spelling"; the
keyboard, clear and "Build from ancestors" are disabled. A spelling written by
the lock is not a user edit, so it never dirties the form. Turning auto-spell off
keeps the generated spelling as the starting point for hand edits; turning it
back on over a different hand spelling is confirmed first. External (non-native)
words cannot be auto-spelled — the wand is disabled.

Every write that changes the phoneme table now finishes by respelling — in the
same transaction as the write, so the two commit or roll back together:

| Trigger (API) | Patterns handed to the respell |
|---------------|--------------------------------|
| `grapheme.create` | its auto-spelling phonemes |
| `grapheme.delete` (`respellLexicon`) | every phoneme it had — after the row is gone |
| `phoneme.add` / `phoneme.delete` | that phoneme (if auto-spelling) |
| `phoneme.update` | the **old and the new** text (skipped for a `context`-only edit) |
| `phoneme.deleteAllForGrapheme` / `phoneme.replaceAll` | old ∪ new auto-spelling phonemes |

**The scan is narrow on purpose.** The speller matches a phoneme as a literal
substring of the pronunciation, so a phoneme can only affect a word whose
pronunciation *contains* it. `getAutoSpelledLexiconMentioning(patterns)` is one
`SELECT … WHERE auto_spell = 1 AND (instr(pronunciation, ?) > 0 OR …)` — `instr`,
not `LIKE`, so `%`/`_` in a phoneme need no escaping — and the DP runs only on
those candidates, with the phoneme map read once for the batch. A candidate is
written only when the regenerated `glyph_order` differs from the stored one, so
`updated_at` does not move for words the change did not affect.

What it deliberately does not do: touch manually spelled words (they are not
derived), respell a word with no pronunciation (nothing to derive from — on a
grapheme delete it keeps the phoneme placeholder `handleGraphemeDeletion`
substitutes), or clear `needs_attention` (set by things only a person can
resolve). Glyph SVG edits and grapheme glyph-composition edits need none of
this: spellings reference grapheme **ids**, so a redrawn glyph shows up
everywhere by itself.

The grapheme edit form saves its pronunciation list with one
`phoneme.replaceAll` (atomic: a rejected row keeps the previous list) rather
than a delete-all plus one `add` per row, which would respell once per row —
the first time against an empty list. The toasts report the count
("Grapheme saved. Respelled 3 words."), and the context re-reads the lexicon
slice after every phoneme write.

### Ancestry and the closure table

`lexicon_ancestry` holds the direct edges; `lexicon_ancestry_closure` holds every
ancestor/descendant pair with its depth, so descendant queries are one indexed
read rather than a recursive CTE. It is maintained, not advisory:

- `setLexiconAncestry` cycle-checks **before** writing (a recursive CTE that
  excludes the rows being replaced), rebuilds the closure, then asserts no
  self-path exists — a failure throws and rolls the whole edit back;
- `deleteLexicon` removes both ancestry directions and rebuilds inside the same
  transaction (v6's `ON DELETE CASCADE` would cover it; the explicit deletes stay
  for ordering clarity);
- an import **ignores** the closure rows in the file and rebuilds from
  `lexicon_ancestry`, so a stale exported closure cannot be imported.

### Import safety — `src/db/exportImport/`

`importExportData` replaces everything, so it is written to be atomic:
snapshot via `exportDatabaseBytes()` → `withTransaction` (clear tables, insert in
FK order, migrate legacy meanings, fix sequences, rebuild the closure,
`PRAGMA foreign_key_check`) → only on success, restore settings through
`settingsApi.importSettings` and `persistDatabaseNow()`. `validateExportData`
runs first: column whitelists, type checks, duplicate-primary-key and
missing-parent-table errors are fatal; dangling CHILD rows are pruned and
counted, and the counts reach the user ("Imported 312 words; 2 orphaned spelling
rows were dropped"). If even the rollback fails, the snapshot is reopened.


---

## Block script (abugida / Mayan-style glyph blocks)

Some scripts do not write one sign after another: an abugida stacks a vowel
mark onto its consonant, hangul packs a syllable into a square, a Mayan glyph
block sets a main sign with affixes around it. The block script lets a conlang
do the same WITHOUT a sign per syllable: the author declares which kinds of
sign fill which part of a square, and every spelling in the app is drawn with
those runs of signs composed into one picture. The plan (with its owner
decisions and pitfalls P1–P15) is [`BLOCK_SCRIPT_PLAN.md`](./BLOCK_SCRIPT_PLAN.md);
this section describes what shipped.

Three owner decisions shape everything below: a **form** (variant) is the same
sound with a different look — phonemes stay on the grapheme; template slots are
**free-form rectangles** on a unit square, each drawing one variant group; and
there is **one block scheme per script** — per-word variation comes from the
templates and from explicit boundaries, never from a per-word scheme selector.

### Vocabulary

| Term | Meaning |
|---|---|
| **Variant** (a "form" in the UI) | One visual form of a grapheme: an ordered glyph list. Exactly one per grapheme is the **default** — what `GraphemeComplete.glyphs` has always meant and what every renderer outside a block draws. |
| **Variant group** | A script-level named bucket ("head", "narrow", "prefix form"…). A grapheme has at most one variant per group. |
| **Role** | A slot type in the scheme (`C1`, `V`, `LOGO`…), user-labelled, with a **matcher** deciding which spelling entries may fill it. |
| **Matcher** | `{ kind: 'class', letter }` (a word-generator class letter: C V P F S N L G R O), `{ kind: 'syllable' }` (a sign whose sound is several IPA sounds, "ka"), `{ kind: 'category', category }` (a grapheme category, e.g. `logogram`), `{ kind: 'any' }`. |
| **Template** | A block shape: a **pattern** (ordered role ids, no role twice — two consonants means roles `C1` and `C2`) plus one **slot** per pattern role. |
| **Slot** | A rectangle on the unit square (`x, y, w, h` in 0..1) plus the variant group it draws (`groupId`, `null` = the default form). Overlap is allowed (infixes); later pattern roles paint on top. |
| **Block** | A run of spelling entries matched to one template, composed into ONE `<svg>`. |
| **Boundary** | An explicit block break inside a word: the IPA syllable separator `.`. |

### Data model (schema v9)

| Table | Shape | Why |
|---|---|---|
| `variant_groups` | `id, name, sort_order, created_at, updated_at` | Referenced by variants (FK) and by template slots (by id, inside the scheme JSON). |
| `grapheme_variants` | `id, grapheme_id → graphemes ON DELETE CASCADE, group_id → variant_groups ON DELETE SET NULL, name, is_default, sort_order, …` | Partial unique index `(grapheme_id) WHERE is_default = 1` (one default per grapheme) and unique `(grapheme_id, group_id)` (one form per group; a NULL group is exempt by SQL semantics). |
| `grapheme_glyphs` | **rebuilt**: `variant_id NOT NULL → grapheme_variants ON DELETE CASCADE` added, `UNIQUE(variant_id, glyph_id, position)` | The old `UNIQUE(grapheme_id, glyph_id, position)` made a second form that reuses a glyph at the same position impossible (P1). `grapheme_id` stays, always equal to its variant's. |
| `block_scheme` | ONE row (`id INTEGER PRIMARY KEY CHECK (id = 1)`), `definition TEXT` (JSON), `updated_at` | The whole scheme as one document. |

**Why the scheme is a JSON document and not tables.** It is edited as one unit
(the Block Designer holds a draft and saves it whole), it is validated in
TypeScript exactly like settings (`validateBlockScheme` in `src/blocks/validate.ts`
is lenient — every correction is an issue with a `path`, unknown keys are
dropped, rectangles are clamped, not discarded), and — unlike settings, which
live in `localStorage` — it is a table row, so it travels inside a raw
`.sqlite` export as well as JSON/PNG. `blockSchemeService.getBlockScheme()`
NEVER trusts the row: no row → `EMPTY_BLOCK_SCHEME` (`enabled: false`), JSON
that does not parse → the empty scheme, logged; validation issues → the
corrected scheme, logged. `saveBlockScheme` stores the CANONICAL JSON of the
validated scheme (`db/utils/blockSchemeCodec.ts`), so what is on disk is what
the engine reads back. `api.blockScheme.save` is lenient in the same way: it
stores the corrected scheme and returns `{ scheme, issues }`;
`api.blockScheme.validate` runs the check without writing.

Variants are served by `src/db/variantService.ts` (`api.variantGroup.*`,
`api.variant.*`: create / update / `setGlyphs` / `setDefault` / delete /
`getPinUsageCount`). `setDefaultVariant` clears the old default before setting
the new one in one transaction (the partial unique index, P2); the default
cannot be deleted; deleting a group leaves its forms ungrouped. Every grapheme
read (`getAllGraphemesComplete`, `getGraphemeComplete`) carries `variants`,
loaded for all graphemes in one extra statement; `variants` stays OPTIONAL on
the `GraphemeComplete` type so the many hand-built test literals still compile,
and every reader treats "absent" as "default only" (P5).
`backfillDefaultVariants` (`db/migrations/repair.ts`) is the one helper that
establishes "every grapheme has exactly one default and every glyph row names a
variant" — shared by migration v9, `repairOrphans` and the JSON import.

### Grapheme forms (variants) in the Script Maker

A grapheme can have several **forms** — the same sound, a different look (a
narrow form for a block's side, a "head" form…). Every grapheme has exactly one
**default** form (`GraphemeComplete.glyphs` — what every renderer draws outside
a block slot or a pin); the
others optionally belong to a script-level **variant group**, and a block
template picks, per slot, the sign's form in that slot's group (see
[How a slot picks a form](#how-a-slot-picks-a-form)). This is the Script Maker
half of the block script; the data model it writes is described
[above](#data-model-schema-v9).

| Piece | Where | Role |
|---|---|---|
| `GlyphListEditor` | `form/graphemeForm/` | ONE form's ordered glyph list: reorder (drag + keyboard), edit link, remove, "Add new glyph" / "Select existing glyph". Used by the default section AND every form card. `preventRemovingLast` keeps a stored grapheme's default from being emptied. |
| `VariantsSection` | `form/graphemeForm/` | "Other forms": a card per form (name `<input>`, group `<select>` greying out groups another form holds, "Manage groups…", its glyph list, **Make default**, **Remove form**) and **Add a form**. |
| `variantDrafts.ts` | `form/graphemeForm/` | The pure model: `VariantDraft { key, id, name, groupId, glyphs }`, `DefaultFormDraft { id, name, groupId }`, `initialVariantDrafts`, `initialDefaultForm`, `makeDraftDefault`, `validateForms`, `formsChanged`. |
| `VariantGroupsDialog` | `tabs/grapheme/variantGroups/` | Self-contained (`open`, `onClose`) list of groups with add, inline rename, and delete (the confirm says how many forms use the group; they are kept, ungrouped). |
| `useGraphemeSubmit({ variants, defaultForm })` | `form/graphemeForm/` | Saves the forms (below). |

The forms are **page state**, like the glyph list — never SmartForm fields (the
pages own `variants` / `defaultForm`; the edit page derives them from the stored
grapheme until touched, with id-derived draft keys so cards never remount).

**"Make default" is an identity swap.** The chosen card's form moves into the
default section and the old default takes the card; on save that is ONE
`variant.setDefault` — each variant row keeps its own glyphs, name and group, so
no glyph is rewritten. On create, a named form made default renames the new
default row after `grapheme.create`.

**Saving an edit** diffs the drafts against `initialData.variants`, validating
everything first (every form named and non-empty, one form per group), then:
free moving groups → create new forms → write glyph ADDITIONS (a form that also
loses glyphs is written as final ∪ leaving first) → `setDefault` → delete removed
forms → write glyph removals → final names/groups. That order means the
one-form-per-group index never trips (two forms can swap groups) and, with
`autoManageGlyphs` on, a glyph moved between forms is never momentarily unused
and garbage-collected. A removed form that words **pin** (`grapheme-12@34`) is
deleted only after a confirm ("N words pin this form; they will fall back to the
default"), asked before anything is written. Every call is checked; failures
join the "Grapheme saved, but not everything on it" warning.

**Displays.** `DetailedGraphemeDisplay` adds a **Forms** row (each non-default
form drawn from its plain `Glyph[]`, captioned `name · group`);
`CompactGraphemeDisplay` shows only the default plus an absolutely-positioned
"+N forms" badge (the card never grows).

### The engine — `src/blocks/` (pure: no React, no database)

```
lexicon.glyph_order ─► buildSpellingDisplay ─► SpellingDisplayEntry[]   (unchanged funnel)
                                                  │
                          normalizeSpellingDisplay(entries, { blockScheme, graphemeMap })
                                                  │
                 scheme absent / null / enabled:false ──► the pre-block path, VERBATIM
                                                  │ enabled
                                                  ▼
               segmentEntries(entries, scheme, graphemeMap)  → Segment[]  (block | single | passthrough)
                                                  ▼
               composeBlock(segment, …)  → ONE RenderableGlyph per block
                                                  ▼
       ltr / block / spiral / … strategies, GlyphSpellingCore, cards, translator, charts — UNCHANGED
```

| File | Does |
|---|---|
| `validate.ts` | `validateBlockScheme(raw) → { scheme, issues }`, `EMPTY_BLOCK_SCHEME`. Guarantees the engine relies on: unique role/template ids, non-empty patterns of existing roles with no role twice, exactly one slot per pattern role, every slot inside the unit square. Pure — whether a `groupId` exists is decided at compose time. `normalizeSoundList` (alias `normalizeDiphthongs`; caps `MAX_SOUND_LIST` / `MAX_SOUND_LENGTH`) is the one normaliser of `split.diphthongs` and `split.syllabicConsonants`. |
| `classify.ts` | `classifyEntry(entry, index) → EntryClass`: `phoneme` (class letters via the generator's `describePhoneme` + `classOf`, read from the grapheme's first auto-spelling phoneme, else its first), `syllable` (several describable sounds, not all vowels — an all-vowel sequence is `V`), `silent` (no phonemes: a logogram), `mark` (a no-phoneme grapheme whose category is `mark` — `MARK_CATEGORY_NAME`, kept equal to `wordSymbolService.MARK_CATEGORY` by a test — or a typed IPA mark such as `ː`, `˥`, a lone combining tilde), `join` (the IPA entry `‿`, `BLOCK_JOIN`), `boundary` (the IPA entry `.`, or a stress mark `ˈ ˌ`), `structural` (separator / line break / punctuation roles), `unknown`. `roleAccepts(role, cls)`: boundaries, joins and structural entries fill NO role; `any` takes everything else; `category` compares the grapheme's category (trimmed, case-sensitive); a mark fills only `any` and `category` roles (a typed IPA mark has no category, so only `any`). |
| `syllabify.ts` | By-syllable cutting: `unitRoleOf(cls)` (THE one nucleus / consonant / mark / opaque test — the segmenter's "opaque" calls it), `unitRoles(units, options)` (adds syllabic-consonant cores), `glueNuclei` (diphthongs and `‿`-joined vowels), `syllabify` (maximal onset; marks ride with the sign before them, joins forbid a cut, a syllable sign takes its coda). |
| `segment.ts` | Greedy, left to right: at each position the templates are tried **in scheme order** and the first whose whole pattern matches wins (`C1 V C2` must sit above `C1 V`, and the designer says so). A boundary is consumed and produces nothing; a structural entry passes through as its own segment, so a block never crosses a word. No match → a `single`. `‿` entries are stripped first and every segment's `entryIndices` mapped back to the original positions (no join ⇒ identical output). Does not read `enabled` — that is the caller's call. |
| `compose.ts` | `composeBlock` → one `<svg viewBox="0 0 100 100">` with one nested `<svg>` per slot at `rect × 100` (multi-glyph forms combined with `combineSvgRow`; an IPA entry drawn as its text stand-in, `containsVirtual: true`). Each cell fits the sign's **ink**, not its drawing canvas (`nestSvgToInk` in `db/utils/svgInkBounds.ts`), so a wide form fills a wide slot; a multi-glyph form's row is measured through its nested cells; a source whose ink cannot be measured exactly (text, images, transforms, unusual viewports) keeps its full viewBox. Measured cells also draw a 1-screen-pixel `non-scaling-stroke` hairline under each mark, so a thin pen stroke survives a small block. `pickVariant(grapheme, groupId, pin)` decides the form (below). `blockKey` gives a stable identity for React keys. |

**One renderable per block.** Normalization (`components/display/spelling/utils/normalization.ts`)
turns each `block` segment into ONE `RenderableGlyph` — `svg_data` = the
composed picture, `block = { templateId, entryIndices, slots, containsVirtual }`,
`isVirtual: false`, `sourceIndex` = its first entry. Every layout strategy
therefore sees "one glyph" and positions it like any other, which is why the
feature needed no change in the strategies, the lexicon cards, the translator
or the charts. `single` and `passthrough` segments render one entry each,
exactly as before. Only `SpellingDisplayEntry[]` input is ever composed —
`Glyph[]`, `GraphemeComplete[]` and id lists never are, which is how the Script
Maker's per-form previews show exactly one form.

**No scheme ⇒ byte-identical output.** With no scheme, `null`, or a disabled
one, the pre-block code path runs verbatim;
`components/display/spelling/__tests__/normalizationIdentity.test.ts` holds a
snapshot recorded from the pre-block code. Never regenerate it to make a change
pass — a diff there means a script without blocks renders differently.

### How a slot picks a form

`pickVariant` precedence, per entry: **a pin** (`grapheme-12@34`, when that
variant still exists on the grapheme) → **the slot's variant group** (when the
slot names one) → **the default**. Rendering never fails: a slot asking for a
group the grapheme has no form in draws the default and reports
`missingGroup: true` on that slot of the block (`RenderableGlyph.block.slots`);
a deleted group left in a slot does the same. Outside a block (a `single`
segment) a pin is honoured too, the group is not.

### Pins — `grapheme-12@34`

A pin fixes ONE occurrence of a sign to one form. `GRAPHEME_ENTRY_RE =
/^grapheme-(\d+)(?:@(\d+))?$/` in `db/utils/spellingUtils.ts` is the single
parser (`isGraphemeEntry`, `extractGraphemeId`, `extractVariantId`,
`parseSpellingEntry` → `variantId`, `createGraphemeEntry(id, variantId?)`);
`grapheme-12@` and `grapheme-@34` are IPA text, not references.
`extractGraphemeIds` reads through the pin, so the `lexicon_spelling` index
still records the grapheme at its position.

- **Manual spellings only.** `deriveAutoSpelledGlyphOrder` never emits a pin, so
  an auto-spelled word has none: saving it, or any respell pass, derives a
  plain spelling (P11). "Auto-spell owns the spelling" includes the forms.
- **Deleting a form strips its pins.** `variantService.deleteVariant` calls
  `lexiconService.handleVariantDeletion` first, which rewrites every word
  pinning it (`stripVariantPins`) back to the automatic choice; the grapheme
  form asks before deleting a pinned form. `repairOrphans` also strips a pin
  naming a variant that is not its grapheme's.
- A pin written through the word form is set in the per-block popover (below).

### The `.` boundary

The IPA syllable separator is the explicit block break (`BLOCK_BOUNDARY` in
`src/blocks/classify.ts`). The auto-speller already kept separators as one
IPA entry each, so a pronunciation `ka.ta` spells as
`["grapheme-1", "grapheme-2", ".", "grapheme-3", "grapheme-2"]`
(with `k`, `a`, `t` as graphemes 1–3) — pinned by
`db/__tests__/blockBoundary.test.ts`. With blocks ON, the segmenter consumes it
(it splits `kata` into `ka` + `ta` and draws nothing); with blocks OFF it
renders exactly as it always did (a text glyph — the identity snapshot covers
it). In the word form it is typed with the keyboard's **Boundary** key (shown
only while the scheme is on, in its own row under the Space / Backspace row —
the shared keyboard has no slot for extra keys) or the physical `.` key, and
drawn as a slim dashed tile, never as a text glyph. Like every key it lands at
the canvas **insertion point**: the canvas is focusable, and the arrows (in the
writing direction), Home and End move a visible, announced caret
(`glyphCanvasInput/utils/canvasCursor.ts`; the cursor strategy is the default,
and with no cursor it appends). A tap on a tile puts the caret before or after
it (by which half was tapped); a press that moves pans instead. The block
popover's "Split before …" does the same in one step.

**The `‿` join** (`BLOCK_JOIN`, U+203F, the IPA undertie) is the mirror: no
syllable break may fall where it sits, and like `.` it draws nothing. The
word keyboard's **Join** key (`createJoinGlyph()` / `isJoinGlyphName()`,
`GlyphCanvasInput`'s `handleJoinKey`) sits right after Boundary under the same
rule (only while the scheme is on), lands at the insertion point, and is drawn
as a slim SOLID tile marked "‿" (tooltip "Block join"). There is no physical
key — nothing on a keyboard means `‿`; a pronunciation typed with `‿` keeps it
as an IPA entry on its own. Stress marks `ˈ ˌ` in a pronunciation cut like `.`.

### Splitting words, flexible slots, lone consonants

Plan: `SYLLABLE_BLOCKS_PLAN.md`. All three are optional fields of the scheme;
a scheme without them renders exactly as before.

- **Splitting (`split`).** *By syllable* (`split.mode: 'syllables'`, the
  recommended setting) cuts each run into syllables first
  (`blocks/syllabify.ts`): consonants between two vowels go to the FOLLOWING
  syllable when they can start one, judged by the generator's sonority rule
  (`isValidOnset`), with an optional s + consonant exception
  (`sibilantClusters`: `sp st str`). Each syllable then takes the template
  that covers it WHOLE with the fewest empty optional boxes (ties: list
  order); a syllable no template covers falls back to template order inside
  itself. *By template order* (absent / `'templates'`) is the original
  left-to-right, first-template-wins rule. A syllable sign or logogram is its
  own unit after syllabifying, but it JOINS a neighbouring syllable when some
  template covers the joined range exactly — the following syllable first
  (`LOGO C V`: a logogram with its phonetic complement), else the previous one
  (`C V LOGO`) unless that one already took a sign. There is no setting: the
  template is the signal, and a scheme without such templates is unchanged.
  `.` still forces a break.
- **Flexible boxes (slot `min` / `max` / `arrange`).** A box can hold exactly
  one sign, be optional, or hold one-to-three / up-to-three signs, shared
  side by side or stacked (`blocks/match.ts` backtracks over the counts;
  `composeBlock` splits the box by the signs' ink shapes — along a row each
  part's width follows its sign's width / height, down a column its height /
  width, clamped to 0.4–2.5, with 1 for a sign whose ink cannot be measured
  such as IPA text; a lone sign keeps the exact box). One `C1(up to 3) V
  C2(up to 3)` template fits `a`, `spɛl` and `strɛŋθs`.
- **Pin and fill (slot `pin` / `fill`, `BLOCK_PLACEMENT_PLAN.md`).** Where a
  sign sits in its box and how big it grows. `pin` is one of the nine positions
  (`top-left` … `center` … `bottom-right`) and maps to the nested `<svg>`'s
  `preserveAspectRatio` align (`xMinYMin` … `xMidYMid` … `xMaxYMax`); `fill`
  chooses the scale — `fit` (the default) is `meet`, so the sign shrinks until
  it sits INSIDE the box, and `fill` is `slice` PLUS `overflow="visible"` on
  that cell, so the sign grows until it spans the box's longer side and the
  rest SPILLS past the box edges (never cropped, never stretched — the owner
  rejected stretching). The pin decides which way it spills: pinned bottom, a
  sign in a flat box grows upward. Overflow stops at the block's own `<svg>`
  viewport (the block root clips — never into the next block in a word), and
  inside a block it may overlap a neighbouring box. `estimateInkBounds`
  measures every align × meet/slice (the content rect clipped to the block's
  own viewBox), so a pinned box no longer makes a block unmeasurable. N1: a box
  with no pin/fill (absent = centre + fit) composes the byte-identical output
  it did before this feature. Every part of a multi-sign slot uses its slot's
  one pin/fill.
- **Diphthongs (`split.diphthongs`, `DIPHTHONG_BLOCKS_PLAN.md`).** Vowel
  sequences the language says as ONE vowel (`ai`, `iə`). By syllable, two or
  three vowel signs side by side whose sounds spell a listed entry are one
  vowel (`glueNuclei`): the syllable is never cut between them, and every
  template match takes the group whole — it counts as ONE sign against a
  box's count, so a plain V box holds the pair and draws both signs in it
  by ink shape. `tai` → one block, `ŋwiən` (with `iə`) → one block. Greedy
  from the left, longest listed entry first; only vowels glue, never across
  a consonant or an opaque sign. The list is normalised by
  `normalizeDiphthongs` (trim, NFC, unique, ≤ 8 code points, ≤ 32 entries;
  absent when empty) — the ONE helper the validator and the designer share,
  so a saved list never differs from its draft.
- **A sign whose sound is several consonants is one consonant.** A grapheme
  with sound `ng`, `kw` (several describable sounds, all consonants)
  classifies as a phoneme with the class letters its members share — always
  `C` — so it fills a consonant box; a *syllable sign* is several sounds
  INCLUDING a vowel (`ka`). Such a sign is licensed at a syllable start only
  on its own (`isValidOnset` has no sonority for `ng`), so `angwa` splits
  `ang · wa`. The grapheme form shows a visible note under such a
  pronunciation (`soundShapeHint`: "ng reads as two sounds (n, g). If it is
  one sound, spell it ŋ.") and never rewrites it.
- **Marks, stress and joins (`CONLANG_EDGES_PLAN.md` §3).** A mark (a
  no-sound grapheme filed under category `mark`, or a typed IPA mark `ː`,
  `˥`) has no sound, so it rides with the sign before it: it is never a
  nucleus, no cut falls right before it, and it is left out of every onset
  sonority test. `ka` + tone + `n` is ONE syllable, which a `C V MARK C2`
  template (a role matching the `mark` category) draws with the mark in its
  own box; with no such role the syllable falls back to template order
  (`[ka] MARK n`). `LOGO MARK` is one range. Stress marks `ˈ ˌ` cut like
  `.`. `‿` forbids a cut: `a‿i` is one vowel with nothing listed, `at‿a` is
  `a · ta`, `a‿t‿a` is one syllable; a join only forbids, it never makes an
  illegal onset legal. `segmentEntries` strips joins before the pipeline and
  maps `entryIndices` back to the original positions, so a spelling with no
  `‿` segments byte-identically to before (P-A2).
- **Syllable signs take their coda.** A syllable SIGN (`ka` — not a
  logogram, unknown or mark) takes the consonants after it that cannot start
  the next syllable: `KA n t a` → `KAn · ta` (`nt` is no legal start, `t`
  is), `KA t a` → `KA · ta`, `KA n` → `KAn`; with s + consonant on, `KA s t a`
  → `KA · sta`. A sign never takes an onset (`t KA` → `t · KA`). A `SYL C`
  template draws it, and a grown range is never joined to a neighbour again.
- **Consonants that carry a syllable (`split.syllabicConsonants`).** Listed
  consonants (`r l m n`, normalised by `normalizeSoundList`) are a
  syllable's core when neither neighbouring non-mark sign holds a vowel — a
  vowel, a marked syllabic consonant or a syllable sign all count: `prst`
  (with `r`) is one syllable, `krtek` → `kr · tek`, `karta` stays
  `kar · ta`. Of a run of listed consonants only the last is the core
  (`mlha` with `m l` → `ml · ha`). A sound written with an IPA syllabic mark
  (U+0329 `r̩`, U+030D above — `SYLLABIC_MARKS`) is always a core, listed or
  not. The class stays `C` (P-B1): a `V` box never takes it, so the
  template needs a core role of class `R` or `any`; a core drawn alone gets
  no vowel-killer mark, and it never glues into a diphthong.
- **Check all my words.** One button on the Blocks page (`WordCheck.tsx`,
  pure `checkWords.ts`) runs the CURRENT draft, unsaved changes included,
  over every spelled word, segmenting each word ONCE with the renderer's own
  `segmentEntries` and phrasing it with `readout.ts` (shared with the "Try a
  word" caption). Four lists: signs drawn on their own (vowel, syllable
  sign, logogram, mark, syllabic core), consonants with no vowel (with the
  mark / drawn alone), signs that cannot be read, and templates no word
  uses. Each list keeps at most `MAX_WORD_CHECK_ROWS = 200` rows (its count
  stays exact); "Try it" shows the word in "Try a word". Computed on click
  only, with a visible note once the draft changes.
- **Consonants with no vowel (`leftovers`).** A consonant left in no block
  can be drawn with a vowel-killer mark — any grapheme the user draws, usually
  a no-sound one — placed below / above / after / before it
  (`composeLoneConsonant`, template id `@lone`, reserved).
- **Designer.** Blocks page: "Splitting words into blocks" (with, by
  syllable, "Vowels next to each other": the diphthong list as chips, an Add
  box, suggestions read from the word generator's literal groups
  (`diphthongSuggestions.ts`), a warning for an entry that is not two vowels,
  and a live `With ai: tai → tai` line; then "Consonants that can carry a
  syllable", the same chip list — `SoundList.tsx` renders both — with
  suggestions from the signs' own sounds (nasals, l- and r-sounds,
  `suggestSyllabicConsonants`), a warning for an entry that is not one
  consonant and a `krtek` example; then a visible line on `.` / `‿` /
  stress marks), "Consonants with
  no vowel", "Try a word" and "Check all my words" (a live preview on the user's own words; captions
  read `ta · pa → 2 blocks: CV, CV` and list only the parts that are not zero —
  `s · t → 2 consonants with a vowel-killer mark`; "No template matched" only
  when no block was made and some sign stands on its own). Template editor: select a box to set
  "How many signs" and "Several signs sit", plus "Where the sign sits" (a 3×3
  pin picker) and "How the sign fits" (Fit inside the box / Fill the box — may
  overflow); counts show on chips, the pattern line, inside boxes and in the
  template list. The selected box shows three resize handles — a corner
  (width + height), a right edge (width) and a bottom edge (height) — each with
  a generous transparent hit area over the drawn shape. Roles: the matcher
  select offers "mark (accent, tone…)", a shortcut that writes `MARK_CATEGORY`
  into the category box (shown while the box reads exactly `mark`; the box stays
  editable). An older language stays on
  template order, with a visible note, until the owner picks By syllable.
  Under the page header an "On this page" row of chip links jumps to every
  section (`PageContents.tsx`): real `#id` anchors that smooth-scroll and focus
  the section without letting the hash reach the router.

### Where renderers get the scheme — `BlockRenderingContext`

`GlyphSpellingDisplay` reads the scheme from context rather than a prop threaded
through every call site (P7). `EtymologProvider` fills a SEPARATE, narrow
`BlockRenderingContext` (`db/context/useOptionalBlockScheme.ts`) holding only
`{ blockScheme, graphemeMap }` (variants included), memoised on those two — the
main context value changes on every refresh, and a gallery holds hundreds of
displays that must not all re-render when a word is added.
`useOptionalBlockScheme()` / `useOptionalGraphemeMap()` return `null` outside a
provider, so the display still renders anywhere (its own tests, isolated
previews) with no blocks. The `blockScheme` **prop** is only an override: a
scheme object is used as-is (the designer's draft preview), `null` forces blocks
off. While blocks are on and the caller passed no `graphemeMap`, the provider's
map is borrowed; while they are off it is not, which keeps the no-scheme path
byte-identical.

The context carries two slices, `data.variantGroups` and `data.blockScheme`:
`blockScheme.save` refreshes the scheme, `variantGroup.*` the groups (a group
delete also refreshes graphemes), and grapheme writes already refresh
`graphemesComplete`, which now includes variants.

### Classification in practice

| The author wants | Role matcher |
|---|---|
| an abugida `C + V` square | `C` = `class C`, `V` = `class V` |
| a coda under the syllable | a third role `C2` = `class C`, template `C1 V C2` above `C1 V` |
| a stop-only or nasal-only position | `class P`, `class N`, … |
| a syllabogram (a sign read "ka") beside an affix | `syllable` |
| a Mayan-style main sign with affixes | `category logogram` for the main sign (the category logogram graphemes carry), `any` for the affixes |
| "whatever sits here" | `any` (never a boundary or a separator) |

### The Block Designer — `/writing-system/blocks`

Writing System gained a router-owned sub-nav, **Direction** (`/writing-system`,
the old page) · **Blocks** (`/writing-system/blocks`), in `WritingSystemMain` /
`WritingSystemNav`. The folder README
[`src/components/tabs/writingSystem/README.md`](./src/components/tabs/writingSystem/README.md)
is the detailed reference; the essentials:

- **Draft / Save / Discard.** `BlocksPage` edits a DRAFT scheme in React state;
  nothing reaches the database until **Save** (`api.blockScheme.save`). Dirty
  (the draft, or the template editor's working copy) is registered with the
  unsaved-changes registry, so the sub-nav and the app nav ask before leaving.
  The API is lenient — the corrections it made are listed inline ("Saved, with
  these corrections") — but the PAGE disables Save while `draftProblems` finds
  something the validator would fix by DROPPING data: a role with an empty
  label, a category role naming no category, a template with no name. A clean
  draft follows the saved scheme when it changes underneath (an import); a
  dirty one is never overwritten.
- **Toolbar**: "Draw words in blocks" switch and the status line
  ("3 roles · 4 templates · 2 variant groups"). Enabled with zero templates is
  a warning here AND on the Direction page (`validateBlockSchemeUsage` in
  `rules/validateWritingSystem.ts`; Blocks checks its draft, Direction the saved
  scheme).
- **Roles** (`RolesEditor`): label, matcher select, colour swatch (utility tokens
  stored as `var(--x)`, so the tint follows the theme). Ids are stable slugs
  (`role-<n>`), never derived from the label. A role any template uses —
  including the one open in the editor — cannot be deleted ("Used by N templates").
- **Variant groups**: "Manage groups…" opens the Script Maker's
  `VariantGroupsDialog`.
- **Templates** (`TemplateList`): the list IS the priority order (cyber
  `ReorderableList` drag / keyboard plus ↑/↓), each row with its priority number,
  a thumbnail of its rectangles, pattern chips, Edit / Duplicate / Delete.
- **Template editor** (`TemplateEditor`, a page section): name; pattern built by
  clicking role chips (each role once; adding one appends ONE rectangle at the
  even-row position for the new length and never moves placed ones); the
  **`RectLayoutEditor`** canvas (generic, scheme-agnostic: drag to move, corner
  handle to resize, 1/8 snapping toggle, arrows move and Shift+arrows resize the
  focused rectangle), each rectangle carrying a form `<select>` (*Default form*
  or a group); and **`BlockPreview`** — a lexicon word or typed IPA rendered with
  the draft plus the working template, forced on, with a caption naming the
  template each block actually used (a template higher in the list can shadow
  the one being edited). **Apply** writes the working copy into the draft (not
  the database); **Cancel** drops it.
- **"Add templates from my word shapes"** (`blocks/seedFromGenerator.ts`) reads
  `settings.wordGenerator.profile.syllables`: each pattern goes through the
  generator's own `parseTemplate` (unparseable → skipped with the parser's
  message); optional items expand to with/without (`(C)V(N)` → `CVN CV VN V`;
  more than 4 optional items → skipped); a variant with a literal sound group
  (`[n ŋ]`) is skipped; the k-th `L` in a pattern maps to the k-th role with
  matcher `class L`, created when missing (labelled `L`, or `L1`, `L2`… when a
  shape repeats the letter); a variant whose matcher sequence an existing
  template already has is skipped (a second run adds nothing, a hand-built
  `C1 V` covers `CV`); slots start in an even row on the default form; new
  templates are appended longest first. The report lists added / skipped.

### Spelling a word with blocks — the word form

`GlyphCanvasInput` reads the scheme from the same context, so nothing is
threaded through `LexiconFormFields`; with the scheme off (or no provider) none
of this mounts. The canvas stays ENTRY-based — one tile per `glyph_order` entry;
cursor, insert, backspace and clear are unchanged. Detail:
[`glyphCanvasInput/README.md` § Blocks](./src/components/form/customInput/glyphCanvasInput/README.md#blocks).

- **Outlines**: the entries are segmented with the engine's own `segmentEntries`;
  each block's tiles get a thin outline in its template's first role's colour
  and a caption band (template name + **Block…**).
- **Preview strip** (`BlockPreviewStrip`): the real `GlyphSpellingDisplay` of the
  current entries — "This is how the word renders everywhere else".
- **Popover** (`BlockPopover`): per slot, the role, the sign and a form
  `<select>` — "Auto (<group>)" / "Auto (default form)" strips the pin, a named
  form pins it (`grapheme-12@34`); **Split before <role>** inserts a `.`,
  **Join with next block** removes the `.` that directly follows.
- Pins ride a parallel `pins` array aligned with the ids
  (`utils/selectionModel.ts`), so the insertion strategies stay typed over
  `number[]` and untouched. The hidden input renders the serialised
  `glyph_order`, pins included.
- **Under the auto-spell lock** the outlines and the strip still show; the
  popover opens read-only (every control disabled, the lock's text on screen)
  and its handlers refuse, so no path writes a pin into a software-owned
  spelling.

### Syllabary previews of empty cells

With the scheme enabled, an EMPTY cell of the syllabary chart and of a custom
syllabary chart (no grapheme reads `ka`) shows a dimmed preview of the syllable
composed from the signs that exist (`k` + `a`), titled "Composed from k + a —
click to create a dedicated sign"; the click still creates the dedicated sign.
`useSyllablePreviewSpeller` (`components/display/composedSyllable/`) spells
from the provider's in-memory graphemes (`autoSpellMappingsFromGraphemes` +
`spellSyllablePreview`, no database read) and returns `null` — no previews, no
spelling work — while the scheme is off. A cell whose consonant or vowel has no
sign stays empty, as before.

### Limitations (by design, or known)

- **One scheme per script.** A word cannot opt into a different scheme; it
  varies through template priority and `.` boundaries.
- **Pins do not survive auto-spell** — by design (P11): turning auto-spell on,
  saving an auto-spelled word or any respell derives a plain spelling.
- **With blocks OFF the display ignores pins.** The no-scheme path is the
  pre-block code verbatim and draws the default form; the word-form canvas still
  draws the pinned form on its tile, and the pin stays stored, so it reappears
  when blocks are switched back on.
- **`value` / `setValue(number[])` on `GlyphCanvasInput` cannot carry pins**;
  entries set that way are unpinned. `glyphOrder` / `setGlyphOrder` do carry them.
- **`missingGroup` is reported, not yet shown.** The composed block records the
  fallback per slot, but no UI surfaces it today — a sign without the group's
  form simply draws its default.
- **Switching templates in the designer does not warn.** Pressing Edit on a
  different template while the editor holds un-Applied changes replaces the
  working copy silently (the page's dirty note and the leave-guard do cover
  leaving the page).

---

## Route Structure

### Complete Route Map

Every route below is declared in `src/url_mapping.ts` (`ROUTES`) and reached
through `resolveUrl()`. The four tab mains own their own nested `<Routes>`, so
the shell's route tree stops at the `/*` splat.

```
/new                                → NewConlangPage (no shell: naming, import, "go to")

/                                   → ConlangGuard > AppShell  (layout route)
├── (index)                        → Navigate to /lexicon
│
├── /lexicon                       → LexiconMain
│   ├── (index)                    → LexiconHome (PageHeader + EntityGallery)
│   ├── /create                    → CreateLexiconPage  ┐ both are LexiconEditor
│   ├── /generate                  → WordGeneratorPage  │ (?pronunciation= prefills create)
│   ├── /db/:id                    → LexiconViewPage (VIEW only + etymology tree)
│   └── /db/:id/edit               → EditLexiconPage    ┘ in mode create / edit
│
├── /script-maker                  → GraphemeMain (nested TabContainer)
│   ├── (Graphemes tab)
│   │   ├── (index)                → GraphemeHome (gallery + nav)
│   │   ├── /create                → CreateGraphemePage
│   │   ├── /chart                 → IPAChartPage
│   │   ├── /syllabary             → SyllabaryChartPage
│   │   ├── /custom-charts         → CustomChartsPage
│   │   ├── /punctuation           → PunctuationPage
│   │   └── /grapheme/db/:id       → GraphemeEditPage
│   └── /glyphs (Glyphs tab)
│       ├── (index)                → glyph gallery
│       ├── /create                → NewGlyphPage
│       └── /db/:id                → GlyphEditPage
│
├── /writing-system                → WritingSystemMain → WritingSystemNav ([Direction | Blocks] strip)
│   ├── (index)                    → WritingSystemPage (Direction: glyph / word / line rules)
│   ├── /blocks                    → BlocksPage (the Block Designer)
│   └── *                          → Navigate to /writing-system
├── /translator                    → TranslatorMain
└── *                              → Navigate to /lexicon
```

### Route Details

| Route | Component | Description |
|-------|-----------|-------------|
| `/new` | `NewConlangPage` | Name a new conlang, import an export, or re-enter the loaded one |
| `/lexicon` | `LexiconHome` | Lexicon gallery with search/filter/sort |
| `/lexicon/create` | `CreateLexiconPage` → `LexiconEditor mode="create"` | Create a word with spelling, meanings and ancestry. `?pronunciation=<ipa>` prefills the pronunciation field WITHOUT marking the form dirty (the generator's "Edit & add" link) |
| `/lexicon/generate` | `WordGeneratorPage` | Build candidate pronunciations from a phonotactic profile and keep the good ones. `?preset=<id>` applies that flavour once on first mount, then strips itself from the URL |
| `/lexicon/db/:id` | `LexiconViewPage` | VIEW a word + its etymology tree. Editing is a route, not a mode |
| `/lexicon/db/:id/edit` | `EditLexiconPage` → `LexiconEditor mode="edit"` | Edit an existing word. Guarded against unsaved-change loss twice (see below) |
| `/script-maker` | `GraphemeHome` | Grapheme gallery with search/sort/pagination |
| `/script-maker/create` | `CreateGraphemePage` | Create new grapheme with glyph selection |
| `/script-maker/chart` | `IPAChartPage` | Interactive IPA consonant & vowel charts |
| `/script-maker/syllabary` | `SyllabaryChartPage` | Syllabary chart |
| `/script-maker/custom-charts` | `CustomChartsPage` | User-defined charts |
| `/script-maker/punctuation` | `PunctuationPage` | Configure punctuation marks and separators |
| `/script-maker/grapheme/db/:id` | `GraphemeEditPage` | Edit existing grapheme |
| `/script-maker/glyphs` | `GlyphsTab` | Glyph gallery with search/sort/pagination |
| `/script-maker/glyphs/create` | `NewGlyphPage` | Create new glyph (standalone page) |
| `/script-maker/glyphs/db/:id` | `GlyphEditPage` | Edit existing glyph |
| `/writing-system` | `WritingSystemPage` (via `WritingSystemMain` / `WritingSystemNav`) | **Direction**: directional layout rules; warns when blocks are enabled with no templates |
| `/writing-system/blocks` | `BlocksPage` | **Blocks**: the block-script designer — roles, variant groups, priority-ordered templates, layout canvas, live preview (see [Block script](#block-script-abugida--mayan-style-glyph-blocks)). `ROUTES.writingSystemBlocks`; it sits under the existing tab, so `TAB_ROUTES` is unchanged |
| `/translator` | `TranslatorMain` | Translate a phrase and render it in the script |

---

## Design System (tokens & shared primitives)

Introduced in the Phase 4 redesign. Two halves: a **token layer** that every
stylesheet paints from, and a set of **shared primitives** that every page
composes.

### The token layer — `src/index.css`

`src/index.css` is the ONLY file in the app allowed to contain a colour, radius
or shadow literal. It declares:

| Block | What is in it |
|---|---|
| `:root` (light) | The full CLAUDE.md semantic set in warm earth tones |
| `[data-theme="dark"]` | The same names in cool blues — **colours only** |
| `:root` (mode-invariant) | Utility colours, layout, fonts, and the 16 nochi shape tokens |
| `:root` (app-derived) | `--surface-hover`, `--surface-raised-hover`, `--border-hover`, `--focus-ring`, `--status-neutral`, `--scrim`, `--scrollbar-thumb` — each defined **in terms of** a canonical token |

Rules, enforced by `src/styles/__tests__/tokens.test.ts`:

1. every custom property a source references is defined in `index.css` (or
   declared locally in the same file, for a component-scoped variable);
2. **no fallback argument inside `var()`.** A fallback looks defensive but is
   what defeated dark mode before Phase 4: with the token undefined, the literal
   always won, including under `[data-theme="dark"]`. Whole surfaces (the entire
   Translator tab, seven delete buttons) were frozen light this way;
3. no hex / rgb / rgba / hsl literal outside `index.css`, except an allowlist
   whose entries carry a written reason (currently: the PNG-export canvas frame,
   which is baked into a downloaded file and must NOT follow the reader's theme,
   and two SVG test fixtures whose literals ARE what is under test);
4. **every text token clears WCAG 2.1 AA (4.5:1) against every background token,
   in BOTH themes.** The test parses `index.css`, composites the translucent
   `--surface-*` tokens over `--page-background-primary` the way the browser
   paints them, and recomputes the ratios. This is not something a browser, a
   linter or a screenshot will tell you: Phase 8 found `--text-secondary-muted`
   at 4.41:1 (light) / 4.35:1 (dark) and the whole light-theme transient status
   family between 2.08:1 and 3.46:1, all of it carrying small text.

Shape tokens are **mode-invariant by contract** — declared once, never inside a
`[data-theme]` block. Light and dark are the same app with different colours; a
radius that changed with the colour scheme would read as a different product.

Fonts load from `<link>` tags in `index.html` (not a render-blocking `@import`
in the CSS), and the page declares `<meta name="color-scheme" content="light dark">`
so form controls, scrollbars and the pre-paint canvas match the active theme.
Because that meta tag lets the UA paint controls dark, `index.css` gives every
`input` / `textarea` / `select` an explicit token background — an element
selector, so a component class still wins on specificity.

App-level container templates live in `src/styles/graphic_template.module.scss`
(`.surfaceCard`, `.surfaceRaised`, `.dangerZone`, `.pageSection`, `.menuItem`).

### Shared primitives — `src/components/shared/`

| Primitive | Purpose |
|---|---|
| `PageHeader` | `<header>` + optional breadcrumb (`<nav aria-label="Breadcrumb">`, last crumb `aria-current="page"`) / back link, title (`as: 'h1' \| 'h2'`), description, right-aligned actions, optional `QuickFactsRow` stats |
| `LoadingState` | `variant: 'page' \| 'gallery' \| 'form' \| 'inline'` skeletons built from cyber `Shimmer` / `DotLoader`, inside one `role="status"` region |
| `DialogPanel` | The content surface of every `<Modal>`: `width: min(<size>, calc(100vw - 2rem))` for `sm`/`md`/`lg`, `aria-labelledby` wired to its own `<h2>` |
| `ConfirmDialogProvider` + `useConfirm()` | ONE confirmation dialog app-wide. `await confirm({ title, message, tone: 'danger' })` |
| `NotificationProvider` + `useNotify()` / `useApiAction()` | ONE failure/success surface. FIFO queue, one banner at a time; success/info auto-hide at 2.5 s, warnings and errors never do |
| `FormActionBar` | `[Delete] …………… [Cancel][Save]` — the destructive control is a separate flex child at the far end of a `space-between` row |
| `FieldHelp` | Keyboard- and screen-reader-reachable field help (a real `<button type="button">` + `HoverToolTip` + a visually-hidden `aria-describedby` copy) |
| `useGalleryState` + `applyGallery` | The ONE gallery state model: `{ query, filter, sortBy, page, pageSize, viewMode }` plus a PURE `applyGallery(items, state, adapters)` that returns `{ pageItems, total, maxPage, page }` with the page **derived** — never a `setState` during render |
| `EntityGallery` | Wraps cyber `DataGallery`: labelled filter select, the two empty states, the card skeleton, and picker (`selectionMode`) support |
| `EntityCard` | One card, one hit area (`<Link>` or `<button>`), actions as a SIBLING row. CSS `:hover` / `:focus-visible`; no JS style mutation, no nested interactive elements |

Both providers are mounted in `src/App.tsx` **above** `<Routes>`, so `/new`
shares them with the shell and a notice raised by an action that navigates
survives the navigation.

**Every delete in the app goes through `useConfirm({ tone: 'danger' })` and
names the entity** — `Delete word "kato"?`, never `Are you sure?`. The nine
hand-rolled delete modals (and the one `window.confirm`) it replaces are gone,
and with them six confirm buttons painted with the undefined `--danger` token,
which rendered as white text on no background.

### cyber-components used

`Modal`, `ConfirmationOverlay` (with the `tone` prop added in Phase 4),
`useConfirmationDialog`, `NotificationBanner`, `Shimmer`, `DotLoader`,
`QuickFactsRow`, `SvgIcon`, `Button`/`buttonStyles`, `IconButton`,
`HoverToolTip`, `EmptyState` (added in Phase 4), `DataGallery`, `DropDownSmall`.

Note that cyber-components which import Next.js are **unusable here** — this app
has no `next` dependency, so `interactable/buttons/backButton`,
`interactable/navigation/breadcrumb`, `buttons/subtleUnderlinedButton`,
`nav/linkListCategory`, `settings/langSelector` and `socials/socialIcon` fail at
RESOLVE time, not render time. Their react-router equivalents live in
`src/components/shared/`.

### Workspace package resolution

`vite.config.ts`, `vitest.config.ts` **and `tsconfig.app.json`** alias
`cyber-components`, `utils-styles`, `utils-func` and `smart-form` to
`../../packages/<name>` rather than letting them resolve through
`node_modules`. In a git worktree those entries are NTFS junctions pointing at
the **main** repo's copy, so without the aliases a package edit made in a
worktree is invisible to that worktree's own dev server, build and typecheck —
which is how a `tone` prop added to `ConfirmationOverlay` in Phase 4 failed to
typecheck in the app that had just added it. The relative path resolves inside
whichever tree the app is checked out in, so behaviour in the main tree is
unchanged.

Side effect of aliasing `smart-form`: `tsc` now reports that package's own
pre-existing errors (`process` typings). Typecheck this app with
`npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -v packages/` — the app's own
count is **0**.

---

## App shell (`src/components/shell/`)

The chrome every conlang page renders inside, plus the two cross-cutting
services it owns. Introduced in the Phase 5 redesign, replacing `MainApp.tsx`
and `components/background/background.tsx`.

| Component | Renders | Notes |
|-----------|---------|-------|
| `AppShell` | the whole layout | skip link → header → status banner → nav → footer, inside `AppBackground` |
| `AppBackground` | cyber `BackgroundComponent` `as="div"` | `min-height: 100dvh`, `overflow: visible`, `overscroll-behavior: auto` (overrides the cyber defaults — see *Scroll model*); `div` because the shell already has a `<main>` |
| `AppHeader` | `<header>` | sticky, `min-height: 57px`, `h1` = conlang name, rename / Export / Import / New conlang / `DarkmodeSwitch`; wraps to two rows under 640px, icon-only under 480px |
| `AppNav` | `<nav aria-label="Primary">` | router-driven `TabContainer`; its panel wraps `BasicBody` → `<main id="main-content">` → `<Outlet/>` |
| `AppFooter` | `<footer>` | build stamp, `PersistenceStatusText`, author |
| `ShellStatusBanner` | persistent `NotificationBanner` | storage errors, recovery, FK violations; `offsetTop` = `SHELL_BANNER_OFFSET_TOP` (73) |
| `PersistenceStatusText` | polite `aria-live` span | Saved / Saving… / Unsaved changes / Not saved, adapter kind on `title` |
| `PwaUpdateGate` | nothing | the three wires between React and the update controller (see *In-app updates*) |

### Scroll model

Nothing in the shell sets a height. The DOCUMENT scrolls and the header sticks.
The previous shell put `height: 100dvh` on an inner box, which made the viewport
the only scroll container and left every page to solve its own overflow — the
`marginBottom: 1rem` hacks in three tab mains existed only for that.

Two shared cyber components the shell is built from ship their own
`overflow: auto`, and each is neutralised by an app-side override (doubled
class, so it beats the library rule regardless of stylesheet order):

| Component | Library default | Why it breaks the shell | Override |
|-----------|-----------------|-------------------------|----------|
| `BackgroundComponent` | `height: 100%; overflow-y: auto; overscroll-behavior: none` | The outermost box is as tall as its content, so it is a scroll container that can never scroll — while the real scrollbar belongs to `<html>`. A mouse wheel over the page latched onto this dead scroller and `overscroll-behavior: none` forbade chaining to the document, so the wheel only worked with the pointer directly over the scrollbar. It was also the anchor `position: sticky` resolved against, so the header scrolled away. | `AppBackground.module.scss` `.background.background { height: auto; overflow: visible; overscroll-behavior: auto }` |
| `BasicBody` | `overflow: auto` | A second scrollbar on tall pages, and it clips anything drawn past the content edge (the Script Maker chart dropdown). | `AppNav.module.scss` `.body.body { overflow: visible }` |

`shell/__tests__/scrollModel.test.ts` pins both overrides at the source, so a
cleanup cannot quietly bring a nested scroll container back. When debugging a
"wheel does nothing" report, list the live scroll containers first —
`[...document.querySelectorAll('*')].filter(e => /auto|scroll/.test(getComputedStyle(e).overflowY))`
should return nothing shell-level — and only then reach for
`src/debug/scrollDebug.ts` (`?scrollDebug=1`), which traces `preventDefault()`
calls and non-passive wheel listeners (the react-zoom-pan-pinch class of bug).

### Unsaved-changes registry

cyber `NavigationGuard` intercepts what leaves the DOCUMENT (reload, close,
back, same-origin anchor clicks). It cannot see a react-router navigation that
never touches an anchor — and the tab strip is exactly that. Edit pages register
their dirty flag and every in-app navigation that can strand an edit goes
through `guardedNavigate`. Use BOTH; they cover different exits.

```tsx
import { useRegisterUnsaved, useUnsavedChanges } from '../../shell';

useRegisterUnsaved('lexicon-editor', formState.isChanged && !formState.isSubmitting);

const { guardedNavigate, confirmDiscard, isDirty } = useUnsavedChanges();
```

`register` / `unregister` take a plain key, but `useRegisterUnsaved` namespaces
it with a per-instance `useId()` — React mounts a remounted component's new
instance BEFORE running the old one's cleanup, so a shared key would be
registered and then immediately unregistered.

`LexiconEditor` is the first consumer and the reference wiring: it mounts
`<NavigationGuard active={isDirty} modalCardTemplate={GuardCard} …/>` AND calls
`useRegisterUnsaved('lexicon-editor', isDirty)`, where
`isDirty = formState.isChanged && !formState.isSubmitting`. The `!isSubmitting`
term is load-bearing — `isChanged` stays true through submission until the
redirect fires, so without it the user is asked to confirm leaving during their
own successful save (SMART_FORM_GUIDELINE §7). Unmounting unregisters, so a form
that navigates away after a save leaves no stale "dirty" behind.

`NavigationGuard` is imported by NAME (`import { NavigationGuard } from
'cyber-components/container/navigationGuard'`): that index re-exports the
component under its name only, so a default import resolves to `undefined` at
runtime while typechecking cleanly under `allowSyntheticDefaultImports`.

### In-app updates (PWA)

Etymolog is a precached PWA, so an open tab keeps running the bundle it first
loaded — a user with the app open for a week never saw a deploy without a
force-refresh. `src/pwa/` closes that gap.

**Mode decision: `registerType: 'prompt'`, not `autoUpdate`.** Under `autoUpdate`
the plugin forces `skipWaiting` + `clientsClaim` into the generated worker and
calls `window.location.reload()` from inside its own `activated` handler — there
is no point at which the app can say "not now, the user is mid-edit". Under
`prompt` the new worker parks in `waiting` until the app posts `SKIP_WAITING`,
which makes the moment of handover an application decision. `injectRegister` is
`false` for the same reason: the app registers itself so it holds the
`ServiceWorkerRegistration` it needs to poll with, and the plugin's
auto-injected `registerSW.js` would be a second registration racing the first.

| Piece | Role |
|-------|------|
| `pwa/updateController.ts` | framework-free singleton: registers the worker, drives the checks, owns the state machine (`idle → checking → ready → applying`, plus `error`). Injectable `registerSW` / `flush` / `now` / `log` / `storage` for tests. |
| `pwa/usePwaUpdate.ts` | `useSyncExternalStore` view of it. The store returns the SAME object until something moves, so an hourly poll does not re-render the shell. |
| `pwa/PwaUpdateGate.tsx` | renders nothing; installs the dirty probe, announces the boot notice, and forwards route changes. Mounted by `AppShell` inside `UnsavedChangesRegistry`. |
| `ShellStatusBanner` | the "A new version is ready" issue — LAST in the issue chain, below every storage error. |

`installPwaUpdates()` runs in `main.tsx` **before React mounts**, next to
`installScrollDebug()`: registration is process-wide and must not be tied to a
tree that remounts.

**Detection.** A waiting worker only appears if something re-fetches the SW
script, which in a long-lived SPA never happens on its own. Four triggers:

| Trigger | Throttle |
|---------|----------|
| hourly interval | — (`PWA_CHECK_INTERVAL_MS`) |
| tab becomes visible | 30 s (`PWA_EVENT_CHECK_THROTTLE_MS`) |
| connection comes back | 30 s |
| in-app route change | 5 min (`PWA_ROUTE_CHECK_THROTTLE_MS`) |

The two event triggers share the floor because both fire in bursts (alt-tabbing,
a flapping connection). Route changes carry the longest window because they are
the highest-frequency signal.

**Applying.** When `onNeedRefresh` fires:

- **registry clean** → `flushPersist()` then `updateSW(true)`. The user sees an
  ordinary reload into the new build, and the next boot says
  `Updated to v0.2.0` once, from a `sessionStorage` flag written immediately
  before the handover (`PWA_APPLIED_FLAG`; per-tab, so other tabs do not
  announce an update they did not perform).
- **registry dirty** → nothing reloads. The shell banner offers it instead, and
  it goes in by itself on the first route change after the editor lets go.
  Dismissing snoozes the BANNER for the session; it does not strand the user on
  the old build.

Form drafts live in React state and never reach SQLite until submit, so a reload
mid-edit destroys them silently. That is why every automatic path is gated on
`useUnsavedChanges().isDirty()` and only the banner's button overrides it — and
why the button's copy names the cost. Persistence is flushed on every path,
including the button, because the SQLite snapshot is written on a debounce.

**`beforeunload` interaction (known wart).** The reload is performed by the
plugin helper, from its `controlling` listener — the app does not call it and
cannot exempt it from `beforeunload`. `LexiconEditor` mounts cyber
`NavigationGuard` with `active={isDirty}`, which is armed in exactly the
situation where the banner appears, so pressing **Reload now** on a dirty form
draws a second, native "Leave site?" prompt. Answering *Stay* (or an automation
environment answering it for you) cancels the navigation with no event to
observe, which used to leave the banner disabled in `applying` for the rest of
the session. `PWA_APPLY_TIMEOUT_MS` (15 s) re-arms the button and clears the
applied flag when the reload does not arrive. The auto-apply path has no such
problem: by the time it runs the editor has already unmounted.

**Dev server.** `virtual:pwa-register` is a no-op stub unless `devOptions` is
enabled, so `registerSW` never calls back and the controller sits silently at
`idle` — no registration, no checks, no log noise. Under vitest the specifier is
aliased (`vitest.config.ts`) to `src/pwa/__mocks__/virtualPwaRegister.ts`, which
copies that stub exactly; the production build has no alias and resolves the
plugin's real module. `src/vite-env.d.ts` carries the
`/// <reference types="vite-plugin-pwa/client" />` that makes the specifier
typecheck.

`window.__etymologPwa` is a diagnostics handle (`getState()`, `checkNow()`,
`apply()`) — "is an update waiting, and why has it not applied?" is otherwise
unanswerable from a user's console.

### Theme

`src/main.tsx` stamps `document.documentElement.dataset.theme` from
`resolveStoredTheme()` (cookie → legacy sessionStorage → OS) before
`createRoot`, and `DarkmodeSwitch` in the header writes the same attribute and
the same `theme-preference` cookie. The cookie is host-only, so on `localhost`
the theme is shared with the other apps in this monorepo regardless of port —
documented behaviour of the shared switch, not a bug.

---

## Component Architecture

### Component Hierarchy

```
App.tsx
└── EtymologProvider (Context)
    └── AppShell (src/components/shell/)
        ├── AppHeader / ShellStatusBanner / AppFooter
        └── AppNav → TabContainer (cyber-components) → BasicBody → <Outlet/>
        ├── LexiconMain (/lexicon)
        │   ├── LexiconHome
        │   │   └── LexiconGallery
        │   │       └── DataGallery (cyber-components)
        │   │           ├── CompactLexiconDisplay
        │   │           └── DetailedLexiconDisplay
        │   ├── CreateLexiconPage
        │   │   └── SmartForm
        │   │       └── LexiconFormFields
        │   │           ├── LabelShiftTextInput (×4)
        │   │           ├── LabelShiftTextCustomKeyboardInput (IPA)
        │   │           ├── SpellingInput
        │   │           └── AncestryInput
        │   ├── WordGeneratorPage           (live settings, NOT a SmartForm)
        │   │   ├── PresetPicker            01 Flavour
        │   │   ├── InventoryEditor         02 Sounds
        │   │   ├── ShapeEditor             03 Shape
        │   │   ├── ConstraintsEditor       04 Constraints
        │   │   └── GeneratedWordList       05 Words
        │   │       └── GlyphSpellingDisplay (the spelling preview per row)
        │   └── LexiconViewPage
        │       ├── DetailedLexiconDisplay
        │       ├── EtymologyTree
        │       │   └── EtymologyTreeNode (recursive)
        │       └── SmartForm (edit mode)
        │           └── LexiconFormFields
        │
        ├── GraphemeMain (/script-maker)
        │   └── TabContainer (nested Graphemes / Glyphs strip, router-driven)
        │       ├── GraphemesTab
        │       │   ├── GraphemeHome
        │       │   │   ├── GraphemeNav
        │       │   │   │   ├── IconButton → /script-maker/create
        │       │   │   │   └── IconButton → /script-maker/chart
        │       │   │   └── GraphemeView
        │       │   │       └── DataGallery (cyber-components)
        │       │   │           └── CompactGraphemeDisplay
        │       │   ├── CreateGraphemePage
        │       │   │   └── NewGraphemeForm
        │       │   │       └── SmartForm
        │       │   │           └── GraphemeFormFields
        │       │   │               ├── GlyphListEditor (default form)
        │       │   │               │   ├── GlyphCard (×N, reorderable)
        │       │   │               │   ├── NewGlyphModal → GlyphForm
        │       │   │               │   └── GlyphPickerModal
        │       │   │               ├── VariantsSection ("Other forms")
        │       │   │               │   ├── GlyphListEditor (per form card)
        │       │   │               │   └── VariantGroupsDialog
        │       │   │               ├── LabelShiftTextInput (×3)
        │       │   │               └── PronunciationTableInput
        │       │   ├── IPAChartPage
        │       │   │   ├── GuidePicker              (header action)
        │       │   │   ├── IPACombinedChart
        │       │   │   │   ├── IPAConsonantChart
        │       │   │   │   │   └── IPAChartCell (×N)
        │       │   │   │   │       └── GlyphSpellingDisplay (if assigned)
        │       │   │   │   ├── IPAExtraSoundsChart  (affricates, clicks, …)
        │       │   │   │   │   └── IPAChartCell (×N)
        │       │   │   │   └── IPAVowelChart
        │       │   │   │       └── IPAChartCell (×N)
        │       │   │   │           └── GlyphSpellingDisplay (if assigned)
        │       │   │   └── GuideLegend              (below the chart, never inside it)
        │       │   └── GraphemeEditPage
        │       │       └── SmartForm
        │       │           └── GraphemeFormFields (mode="edit")
        │       │
        │       └── GlyphsTab
        │           ├── GlyphGallery
        │           │   └── DataGallery (with toolbarEndSlot)
        │           │       ├── GlyphCard (route mode)
        │           │       └── [Auto-manage toggle via CyberSwitch]
        │           ├── NewGlyphPage
        │           │   └── GlyphForm
        │           │       └── GlyphFormFields
        │           └── GlyphEditPage
        │               └── SmartForm
        │                   └── GlyphFormFields (mode="edit")
        │
        └── WritingSystemMain (/writing-system)
            └── WritingSystemNav (TabContainer, router-driven: Direction | Blocks)
                ├── WritingSystemPage          (index — Direction rules + warnings)
                └── BlocksPage                 (/blocks — draft scheme, Save / Discard)
                    ├── RolesEditor
                    ├── VariantGroupsDialog    ("Manage groups…")
                    ├── TemplateList           (priority order, ReorderableList)
                    └── TemplateEditor         (the open template's working copy)
                        ├── RectLayoutEditor   (one rectangle per pattern role)
                        └── BlockPreview
                            └── GlyphSpellingDisplay (blockScheme={draft})

LexiconFormFields → GlyphCanvasInput  (the Spelling section; block UI only while the scheme is on)
├── GlyphCanvas                (tiles + block outlines / captions)
├── BlockPreviewStrip          → GlyphSpellingDisplay
├── BlockPopover               (pin a form per slot, Split / Join)
└── GlyphKeyboardOverlay       (+ the Boundary key row)

IPASyllabaryChart / CustomSyllabaryChart
└── ComposedSyllablePreview    (empty cells, only while the scheme is on)
    └── GlyphSpellingDisplay
```

### Component Categories

| Category | Components | Location |
|----------|------------|----------|
| **App shell** | `AppShell`, `AppHeader`, `AppNav`, `AppFooter`, `ShellStatusBanner`, `UnsavedChangesRegistry` | `src/components/shell/` |
| **Tab mains** | `LexiconMain`, `GraphemeMain`, `WritingSystemMain`, `TranslatorMain` | `src/components/tabs/*/main.tsx` |
| **Shared gallery** | `EntityGallery`, `EntityCard`, `useGalleryState` / `applyGallery` | `src/components/shared/gallery/` |
| **Gallery bindings** | `GraphemeGallery`, `GlyphGallery`, `LexiconGallery` — per-entity search/sort/filter + renderers only | `src/components/tabs/*/gallery*/` |
| **Create Pages** | `CreateGraphemePage`, `NewGlyphPage`, `CreateLexiconPage` | `src/components/tabs/*/create*/` or `new*/` |
| **Edit/View Pages** | `GraphemeEditPage`, `GlyphEditPage`, `LexiconViewPage` (view only), `EditLexiconPage` | `src/components/tabs/*/edit*/` or `view*/` |
| **Shared editors** | `LexiconEditor` (`mode: 'create' \| 'edit'`) | `src/components/tabs/lexicon/editor/` |
| **IPA Chart** | `IPAChartPage`, `IPACombinedChart`, `IPAConsonantChart`, `IPAExtraSoundsChart`, `IPAVowelChart`, `IPAChartCell` | `src/components/tabs/grapheme/ipaChart/`, `src/components/display/ipaChart/` |
| **Flavour guide** | `GuidePicker`, `GuideLegend`, `useGuidePreset`, `guideTiers` | `src/components/display/ipaChart/` |
| **Word generator** | `WordGeneratorPage`, `PresetPicker`, `InventoryEditor`, `ShapeEditor`, `ConstraintsEditor`, `GeneratedWordList`, `useGeneratorProfile`, `useDraftText` | `src/components/tabs/lexicon/generator/` |
| **Generator core** (no React) | `phonology/`, `profile/`, `presets/`, `engine/`, `coverage`, `inventory` | `src/generator/` |
| **Form Components** | `GlyphFormFields`, `GraphemeFormFields`, `LexiconFormFields` | `src/components/form/*/` |
| **Display Components** | `GlyphCard`, `CompactGraphemeDisplay`, `DetailedGraphemeDisplay`, `CompactLexiconDisplay`, `DetailedLexiconDisplay`, `EtymologyTree`, `GlyphSpellingDisplay` | `src/components/display/*/` |
| **Custom Inputs** | `PronunciationTableInput`, `SpellingInput`, `AncestryInput` | `src/components/form/customInput/*/` |
| **Modal Components** | `NewGlyphModal`, `EditGlyphModal` | Various locations |
| **Grapheme forms** | `GlyphListEditor`, `VariantsSection`, `variantDrafts`, `VariantGroupsDialog` | `src/components/form/graphemeForm/`, `src/components/tabs/grapheme/variantGroups/` |
| **Block Designer** | `WritingSystemNav`, `BlocksPage`, `RolesEditor`, `TemplateList`, `TemplateEditor`, `RectLayoutEditor`, `BlockPreview`, `blockSchemeDraft`, `seedFromGenerator` | `src/components/tabs/writingSystem/`, `…/writingSystem/blocks/` |
| **Blocks while spelling** | `BlockPreviewStrip`, `BlockPopover`, `selectionModel`, `blockUtils` | `src/components/form/customInput/glyphCanvasInput/` |
| **Block engine** (no React) | `validateBlockScheme`, `classifyEntry`, `segmentEntries`, `composeBlock` | `src/blocks/` |
| **Syllabary previews** | `ComposedSyllablePreview`, `useSyllablePreviewSpeller` | `src/components/display/composedSyllable/` |

### Gallery Features (one implementation, three bindings)

All three galleries — lexicon, grapheme, glyph — are the SAME component. Phase 6
collapsed three near-verbatim copies (each ~300 lines, each with its own
`setCurPage()` during render, its own JS hover-mutation and its own delete
modal) onto `src/components/shared/gallery/`:

```
useGalleryState({ defaultSort, defaultFilter?, defaultPageSize?, defaultViewMode? })
    → { query, setQuery, filter, setFilter, sortBy, setSortBy,
        page, setPage, pageSize, setPageSize, viewMode, setViewMode }

applyGallery(items, state, { search?, filter?, sort? })
    → { pageItems, total, maxPage, page }        // `page` is DERIVED + clamped

<EntityGallery items state adapters keyExtractor renderItem itemLabel
               itemHref? onItemActivate? renderActions?
               selectionMode? onSelect?
               ariaLabel isReady? error?
               sortOptions filterOptions? filterLabel? searchPlaceholder?
               showViewToggle? minItemWidth? maxItemWidth? itemGap? toolbarEndSlot?
               empty noMatch? />
```

What the shared layer guarantees, in every gallery:

- **The page is derived, never stored.** `applyGallery` clamps the requested
  page against the live result count. The copies called `setCurPage()` *during
  render* (a `react-hooks/set-state-in-effect` violation) and therefore rendered
  an empty grid for one pass whenever the list shrank under the user.
- **Two empty states, told apart.** "Nothing yet" carries the CTA that creates
  the first item; "nothing matched" carries a **Clear filters** action that
  resets both the query and the filter. A filtered-empty grid is never a dead
  end.
- **A card skeleton while `isReady` is false** (`LoadingState variant="gallery"`),
  not a blank grid and not the word "Loading".
- **One hit area per card, actions outside it.** `EntityCard` renders a `<Link>`
  (or, in `selectionMode`, a `<button>`) plus a SIBLING actions row. The copies
  rendered a `<div role="button">` with an absolutely-positioned delete
  `<button>` inside it — an interactive element nested in an interactive
  element. `article button button` / `a button` are now empty selectors on every
  gallery page, and this is asserted in `EntityGallery.test.tsx`.
- **Hover and focus are CSS.** `:hover` / `:focus-within` lift the card and
  `:focus-visible` rings the hit area, honouring `prefers-reduced-motion`. The
  copies wrote `style.transform` and `style.boxShadow` from `onMouseEnter` /
  `onMouseLeave`, so keyboard users saw nothing.
- **A labelled filter select** (`<label htmlFor>`), not a bare `<select>` after
  a `<span>Filter:</span>`.
- **Deletion goes through `useConfirm({ tone: 'danger' })` and `useApiAction`**,
  so it always names the entity and always reports a failure.
- **`settings.defaultGalleryView` is finally honoured** — it is the default
  `viewMode` (the legacy `'expanded'` value maps to `'detailed'`). All three
  copies hardcoded their own default and ignored the setting.

`onItemActivate` is deliberately NOT forwarded to `DataGallery`: its gridcell
wrapper fires that callback on click too, so wiring both would navigate — or
select — twice per click. The CARD owns activation; `DataGallery` keeps only the
roving-arrow keyboard navigation.

#### Per-gallery bindings

| Gallery | File | Search over | Sorts | Filter | Card actions |
|---|---|---|---|---|---|
| Lexicon | `tabs/lexicon/galleryLexicon/LexiconGallery.tsx` | pronunciation, lemma, meaning | pronunciation A-Z/Z-A, descendants, created | Word origin (all / native / external) | Edit (link to `lexiconEdit`), Delete |
| Grapheme | `tabs/grapheme/galleryGrapheme/graphemeGallery.tsx` | name, phoneme, glyph name | name A-Z/Z-A, glyph count | — | Delete |
| Glyph | `tabs/grapheme/galleryGlyphs/galleryGlyphs.tsx` | name | name A-Z/Z-A, usage count | — | Delete (`api.glyph.cascadeDelete`) |

`GraphemeGallery` keeps `selectionMode` because `PunctuationPage` uses it as a
grapheme picker: every card becomes one `<button>` calling `onSelect`, the
delete action is suppressed (a picker must not be able to destroy the thing the
user came to choose), and the empty state loses its create-CTA. Phase 7's glyph
picker reuses the same flag.

`GlyphGallery` keeps its **Auto-manage** switch in `toolbarEndSlot`. The switch
now carries a real `aria-label`; the `<label htmlFor="auto-manage-glyphs">` it
replaces pointed at an id `CyberSwitch` never renders, so the label was inert.

---

## Folders & the inline tree explorer

Words, glyphs AND graphemes can each be organised into nested folders, browsed
as a **collapsible tree rendered inside the gallery itself** — expand a folder in
place (Finder list-view style) and see the current directory and its children at
once, recursively. The "directory" concept is shared by all three domains, so it
is ONE reusable renderer plus ONE app-side binding, never three copies.

### Data model — three sibling folder tables, one engine

Each domain has its own folder table — `lexicon_folders` (migration v7),
`glyph_folders` and `grapheme_folders` (v8) — as exact structural clones rather
than a single table with a `domain` column, so every foreign key stays honest.
Each item table carries a nullable `folder_id ... ON DELETE SET NULL` (an item
whose folder is deleted falls back to root, it is never destroyed).

One parameterised service engine drives all three:

```
src/db/folderDomain.ts
  createFolderDomain({ folderTable, itemTable, itemFolderColumn, label })
    → lexiconFolderDomain · glyphFolderDomain · graphemeFolderDomain
```

- `folderService.ts` is now a set of thin re-exports of the lexicon instance, so
  every historical import keeps working.
- `MAX_FOLDER_DEPTH = 12` (root folder = depth 1). `moveFolder` is guarded
  against cycles (walks the target's parent chain) and against exceeding the
  depth cap (`depthOf(newParent) + subtreeHeight(id) <= MAX`).
- **`deleteFolder` deletes nothing but the folder row.** Child folders AND items
  reparent to the deleted folder's parent in ONE transaction — the delete dialog
  says so.
- `setItemFolder(itemId, folderId | null)` files or unfiles a single item.

The API mirrors the engine: `createFolderApi(domain)` produces the same
`FolderApi` surface (list / getById / create / rename / update / move / delete /
getPath / setItemFolder) for each domain. `api.folder` is the lexicon instance
(it keeps a `setLexiconFolder` alias for back-compat); `api.glyphFolder` and
`api.graphemeFolder` are the other two. The `createGlyph` / `createGrapheme`
paths accept an optional `folder_id` (validated against the domain's folder
table; an invalid id throws, except on import, which coerces a dangling id to
root). Word-symbol auto-created glyph + grapheme always land at root — folder ids
do not translate across domains.

`folderApi.fromError` maps engine errors by string-sniffing five message
substrings (`not found`, `cannot exceed`, `into itself`, `own descendant`,
`needs a name`); the engine keeps them byte-identical across all three domains.

The context (`useEtymolog().data`) exposes three folder slices —
`folders` (lexicon), `glyphFolders`, `graphemeFolders` — wired through the closed
`RefreshError` union, `EMPTY_DATA`, the refreshers and `batchMutations` exactly
like every other slice.

### `TreeExplorer` — the generic renderer (in cyber-components)

The tree itself is a generic, **reusable** cyber-components primitive at
`packages/cyber-components/display/treeExplorer/` (documented in that package's
`COMPONENT_DIRECTORY.md`) — so nochi and taxonia can adopt it too. It imports
neither `next` nor `react-router-dom`: links and routing arrive via render props,
keeping it framework-agnostic.

| Piece | Role |
|---|---|
| `buildForest(nodes, compareNodes?)` | Pure flat-list → forest. Every walk carries a visited-set guard: an orphan (missing/self parent) renders at ROOT, a cycle is broken (one member promoted to root) and always terminates — nothing is ever dropped or hangs. |
| `useTreeState(...)` | Headless expansion hook — `expandedIds` as a `ReadonlySet`, controlled (`expandedIds` + `onExpandedChange`) or uncontrolled (`defaultExpandedIds`); `isExpanded` / `toggle` / `expand` / `collapse` / `collapseAll`. |
| `TreeExplorer` | Recursive disclosure renderer. Each node is a header row = a real `<button aria-expanded aria-controls>` (chevron + caller `renderNodeHeader`) with an `endSlot` rendered OUTSIDE the button (no button-in-button); expanded content = the child sub-tree THEN `renderNodeContent`. |

**A11y is the disclosure pattern, not `role="tree"`.** Because expanded content
embeds arbitrary interactive card grids, a strict tree (which would own all
Arrow-key focus) is avoided: nested `<ul role="list">` + disclosure buttons with
`aria-expanded` / `aria-controls`, normal tab flow, plus ArrowLeft/ArrowRight as
progressive enhancement on the header buttons. Indentation is a per-level step
**visually capped at level 4** (`min(level, 4)`) with a continuous guide line so
deeper nesting still reads as nested; all colours are semantic CSS tokens.

### `DirectoryGallery` — the one binding (cap-and-focus)

`src/components/shared/directory/DirectoryGallery.tsx` is the single etymolog
binding all three galleries render through (`LexiconGallery`, `graphemeGallery`,
`galleryGlyphs` each pass their existing adapters/renderers plus `folders`,
`getItemFolderId`, `folderApi` and a `domainKey`). It wraps `EntityGallery` and
adds the folder chrome:

- **Flat vs tree.** `flatView = selectionMode || allItems || searchActive` — in
  flat/picker mode it renders the plain paginated `EntityGallery` exactly as
  before. **Search always escapes folders; pickers are always flat** (no folder
  chrome), matching the shipped semantics.
- **Cap-and-focus, never auto-navigate.** An expanded folder shows its child
  folders (further expandable) plus its first `TREE_ITEM_CAP = 12` items as a
  card grid, then a **"Show all N →"** row that FOCUSES the folder (it becomes
  the tree root, the breadcrumb grows, `?folder=` updates). A small folder that
  never reaches the cap gets an always-present **open-folder** affordance
  (`box-arrow-in-right`) in its row so it is still focusable. Nothing ever
  navigates by itself. There is no pagination in tree mode — the cap replaces it.
- **Per-node CRUD** lives in the row's `endSlot`: open folder / new subfolder /
  rename / move / delete, driven by the shared `FolderNameDialog` and
  `MoveToFolderDialog` (generalised over `FolderRecord`). A per-card **Move to
  folder** action is added once in the wrapper, so all three domains get it.
- **Create-in-folder.** `?folder=<id>` is carried into each create route via the
  per-domain `createHref` helpers (`lexiconCreateHref` / `glyphCreateHref` /
  `graphemeCreateHref`); the create page validates it against its own slice and
  threads `folder_id` onto the new row.
- **Deep links + persistence.** `?folder=<id>` is the focused root — parsed and
  validated against the loaded slice (unknown/non-numeric → root) in ONE place.
  The expanded-folder set persists per domain in `localStorage`
  (`etymolog.treeExpansion.<domainKey>`); every read/write is `try/catch`ed,
  shape-validated, and pruned against the live slice, so a corrupt or stale value
  degrades to an empty set, never a crash.

The old `tabs/lexicon/folders/*` module paths remain as re-export shims, so
nothing outside `shared/directory/` had to change.

### Export / import (envelope v4)

`EXPORT_SCHEMA_VERSION = 4` (`src/config/version.ts`). Version 3 added
`glyph_folders`, `grapheme_folders` and the three `folder_id` columns, so folders
and memberships for all three domains round-trip losslessly; version 4 adds the
[block script](#block-script-abugida--mayan-style-glyph-blocks)'s
`variant_groups`, `grapheme_variants` and `block_scheme` tables and
`grapheme_glyphs.variant_id`. Every version from 1 to 4 still imports: absent
tables come in empty (v1/v2 → no folder tables; v1–v3 → no variant or scheme
tables), a glyph row without a `variant_id` is attached to its grapheme's
default variant, and `backfillDefaultVariants` gives every grapheme without one
a 'Default' variant before the glyph rows go in. The imported `block_scheme`
definition is run through `validateBlockScheme` and stored in canonical form —
a corrupt or hand-edited document imports as whatever the validator makes of it
(the empty scheme at worst) with a warning, and never fails the import. Import
also coerces any dangling
`folder_id` / `parent_id` to root. Because a *moved* folder can end up with a
lower row id than its parent, the import transaction runs under
`PRAGMA defer_foreign_keys = ON` so a valid-but-out-of-order insert order does not
abort the restore — the end-of-transaction `foreign_key_check` remains the sole
integrity gate.

---

## Auto-Manage Glyphs Feature

### Overview

The **Auto-Manage Glyphs** feature automatically cleans up orphaned glyphs (glyphs with zero usage) when graphemes are deleted or modified. This helps maintain a clean database by removing unused visual elements.

### How It Works

1. **Setting Toggle**: Users can enable/disable via a `CyberSwitch` in the glyph gallery toolbar
2. **Orphan Detection**: When a grapheme is deleted or its glyph composition is updated, the system checks for glyphs with no references in the `grapheme_glyphs` table
3. **Automatic Cleanup**: If `autoManageGlyphs` is `true`, orphaned glyphs are automatically deleted
4. **Logging**: Console logs show how many glyphs were cleaned up (e.g., `[Auto-manage] Cleaned up 2 orphaned glyph(s)`)

### Implementation

**Database Service** (`src/db/glyphService.ts`):
```typescript
export function cleanupOrphanedGlyphs(): number {
    const db = getDatabase();
    
    // Find glyphs with no grapheme_glyphs references
    const result = db.exec(`
        SELECT g.id
        FROM glyphs g
        LEFT JOIN grapheme_glyphs gg ON g.id = gg.glyph_id
        WHERE gg.id IS NULL
    `);
    
    // Delete orphaned glyphs and persist
    // Returns count of deleted glyphs
}
```

**API Integration** (`src/db/api/graphemeApi.ts`):
- `deleteGrapheme(id)`: Checks setting after deletion
- `updateGraphemeGlyphs(id, request)`: Checks setting after glyph composition update

**UI Control** (`src/components/tabs/grapheme/galleryGlyphs/galleryGlyphs.tsx`):
```tsx
<DataGallery
    toolbarEndSlot={
        <div>
            <label>Auto-manage</label>
            <CyberSwitch
                value={settings.autoManageGlyphs}
                onChange={handleAutoManageGlyphsToggle}
            />
        </div>
    }
    // ...other props
/>
```

### Storage

Currently stored in **localStorage** (`etymolog_settings_v1` key) for simplicity. Future enhancement: migrate to **SQLite** so the setting travels with exported conlang files.

---

## Punctuation & Separators (new)

The app now includes a dedicated Punctuation configuration UI at `/script-maker/punctuation` and programmatic settings for punctuation marks. This enables:

- Assigning a grapheme to punctuation marks (word separator, sentence separator, comma, question mark, exclamation, colon, semicolon, ellipsis, quotes)
- Using a virtual glyph (dashed box showing the original character) when no grapheme is assigned
- Hiding a punctuation mark entirely (no glyph inserted) using the "no-glyph" / hide toggle

UI: `PunctuationPage` (Script Maker → Punctuation)
- Shows a table of punctuation marks grouped by category (Word Separators, Sentence Endings, Pause Marks, Quotation Marks)
- Each row shows the symbol, description, current display (grapheme / virtual / hidden), and action buttons:
  - Eye/eye-slash: toggle hide/show (no-glyph mode)
  - + / pencil: assign or change grapheme (opens Grapheme gallery in selection mode)
  - X: clear assignment

Programmatic representation (summary):

```ts
interface PunctuationConfig {
  graphemeId: number | null; // ID of assigned grapheme (null for virtual)
  useNoGlyph: boolean;       // true => hidden (no glyph rendered)
}

ninterface PunctuationSettings {
  wordSeparator: PunctuationConfig;
  sentenceSeparator: PunctuationConfig;
  comma: PunctuationConfig;
  questionMark: PunctuationConfig;
  exclamationMark: PunctuationConfig;
  colon: PunctuationConfig;
  semicolon: PunctuationConfig;
  ellipsis: PunctuationConfig;
  quotationOpen: PunctuationConfig;
  quotationClose: PunctuationConfig;
}
```

How translation uses punctuation settings:
- The phrase translator (`phraseService.translatePhrase`) accepts optional punctuation settings and resolves any configured grapheme IDs to grapheme objects. Word separators and punctuation are then inserted into the combined spelling according to those settings. If `useNoGlyph` is true for a mark, that mark is omitted from the output.

API usage example (Translator):
```ts
// From a component using the context
const { api, settings } = useEtymolog();
// Pass the settings.punctuation object to the phrase API
const result = api.phrase.translate('hello world', settings.punctuation);
```

Developer notes:
- Settings persist in localStorage under `etymolog_settings_v1`.
- Grapheme assignments are stored by ID (so they remain stable across sessions).
- The Grapheme gallery supports a `selectionMode` that hides delete controls and returns a selected grapheme via `onSelect`.

---

## Word generator (new)

`/lexicon/generate` builds candidate **pronunciations** from a phonotactic
**profile** — an inventory of sounds, a set of syllable shapes, a frequency tilt
and a handful of constraints — and hands the ones you keep to the lexicon, where
the existing auto-spell turns them into written words. Seven **flavour presets**
("Elvish / flowing", "Harsh / guttural", "Japanese-like", …) fill a profile in
one click, and the same choice can be painted onto the IPA chart as a **guide
overlay**: core sounds lit, flavour sounds tinted, avoided sounds dimmed. The
overlay is a suggestion; nothing in the app ever enforces it.

Text-to-speech is deliberately out of scope — see `todo.md`.

### Architecture

`src/generator/` is pure TypeScript in the spirit of `src/rules/`: **no React,
no db imports, no DOM**. It runs in a node test without the sql.js setup, and a
ratchet (`phonology/__tests__/sources.test.ts`) enforces the boundary. The page
layer supplies the profile and the sounds; everything below is a function of its
arguments.

```
src/generator/
  phonology/
    features.ts    IPA symbol -> features, built ONCE from src/data/ipaChartData.ts
                   (+ EXTRA_SYMBOLS for what the chart lacks: ɕ ʑ w ʍ ɫ ɚ ɝ ɹ̠;
                    aliases for ɡ->g and the withdrawn ligatures ʧ ʤ ʦ ʣ ʨ ʥ)
                   phonemeIdentity() — the ONE "is this sound that sound?" test
    tokenize.ts    IPA string -> tokens (base + marks + tie bars kept together)
    sonority.ts    the scale, isValidOnset / isValidCoda / isValidContact,
                   splitMedialCluster
    classes.ts     the class letters C V P F S N L G R O + CLASS_LABELS
  profile/
    types.ts       WordGeneratorProfile / WordGeneratorSettings — the persisted shape
    defaults.ts    DEFAULT_PROFILE, LIMITS
    validate.ts    validateGeneratorSettings(raw) -> { settings, issues }
  presets/
    types.ts       FlavourPreset
    data/*.ts      one file per preset (7)
    index.ts       PRESETS, PRESET_IDS, getPreset, applyPreset, presetInventory
  coverage.ts      computeCoverage(preset, phonemes), guideMapFor(preset)
  engine/
    random.ts      mulberry32 + pickWeighted / pickInt (randomSeed is the ONLY
                   non-deterministic call in the whole module)
    weights.ts     Gusein-Zade curve × COMMONNESS_RANK × the user's tilt
    template.ts    parseTemplate / expandTemplate / isValidTemplatePattern
    constraints.ts CONSTRAINT_RULES + explainViolation
    normalize.ts   normalizePronunciation — the dedupe key
    generate.ts    generateWords(profile, inventory, { count, seed, existing })
  inventory.ts     deriveInventory(source, profile) -> ClassifiedInventory

src/components/display/ipaChart/       the guide overlay + the extras strip
  IPAChartCell        `guide` / `guideLabel` -> tier class + data-guide + aria-label
  IPAExtraSoundsChart affricates, clicks, implosives and the extras
  GuidePicker         the flavour select; writes settings, no local state
  GuideLegend         the three tiers, their counts, and the two links
  useGuidePreset      settings -> preset -> guide map + coverage, one derivation

src/components/tabs/lexicon/generator/  the page
  WordGeneratorPage   the route; owns the seed and the batch memo
  PresetPicker        01 Flavour   (native radios inside cards)
  InventoryEditor     02 Sounds    (chips by class, click cycles the tilt)
  ShapeEditor         03 Shape     (templates + weights, counts, long vowels)
  ConstraintsEditor   04 Constraints
  GeneratedWordList   05 Words     (select, add, regenerate, copy)
  useGeneratorProfile the ONE source of truth: settings + reactive data
```

Data flow:

```
settings.wordGenerator.profile ──┐
                                 ├─► deriveInventory ─► generateWords ─► batch
conlang phonemes (context) ──────┘                                        │
                                            api.lexicon.previewAutoSpelling
                                                                          │
                            api.lexicon.create({ glyph_order }) ◄─────────┘
                       or  /lexicon/create?pronunciation=…  (the word form)
```

### The profile, and where it lives

The profile is a **settings key**, not a table — there is no migration, and it
travels in the JSON/PNG export envelope exactly like `customCharts`. Raw
`.sqlite` exports do not carry it (same known limitation; see `todo.md`).

```ts
interface WordGeneratorSettings {
    profile: WordGeneratorProfile;
    /** Which preset the IPA chart paints. null = the guide is off. */
    guidePresetId: string | null;
}

interface WordGeneratorProfile {
    version: 1;
    presetId: string | null;              // the preset it was started from
    inventory: string[];                  // EMPTY = "use my script's sounds"
    phonemeTilt: Record<string, FrequencyTilt>;   // 'common' | 'normal' | 'rare' | 'off'
    frequencyCurve: 'zipf' | 'flat';
    syllables: SyllableTemplate[];        // { pattern, weight }, at least one
    syllableCount: { min: number; max: number };  // 1..5, uniform over the range
    clusters: {
        sonority: boolean;                // + the Syllable Contact Law, see below
        sibilantOnsetException: boolean;  // st- sp- sk-, word-initially only
        allowGeminates: boolean;
        maxPerWord: number;               // 0..4
    };
    vowelHarmony: 'off' | 'frontBack';
    longVowelChance: number;              // 0..1
    forbidden: string[];                  // rejected anywhere in a word
}
```

Reading and writing it:

```tsx
const { api, settings } = useEtymolog();

// `api.settings.update` is STRICT and replaces a nested key WHOLESALE —
// always spread the entire `wordGenerator` object, never a partial profile.
api.settings.update({
    wordGenerator: { ...settings.wordGenerator, guidePresetId: 'flowing' },
});
```

`validateGeneratorSettings` follows the `settingsSchema.ts` house style: an
absent key is the default with **no issue** (an older stored settings object must
not spam warnings on boot), a present-but-wrong value is corrected *and*
reported. Numbers clamp, wrong types fall back, and an unparseable template is
dropped carrying the parser's own message.

### Template grammar

A syllable shape is a sequence of items. An item is a **class letter**, a
**literal group**, or either of those wrapped in `( … )` to make it optional (a
flat 50 % chance — there is no percentage syntax in v1).

| Letter | Members |
|---|---|
| `C` | every consonant |
| `V` | every vowel |
| `P` | stops — plosives, affricates, clicks, implosives |
| `F` | fricatives (lateral fricatives included) |
| `S` | sibilants |
| `N` | nasals |
| `L` | liquids — lateral approximants, trills, taps |
| `G` | glides — non-lateral approximants (`j w ɰ ʋ ɹ ɻ`) |
| `R` | sonorant consonants = N ∪ L ∪ G |
| `O` | obstruents = P ∪ F |

Literal groups name sounds directly: `CV[n ŋ]` closes a syllable with `n` or `ŋ`
and nothing else. Splitting is by whitespace when there is any inside the
brackets, otherwise by phoneme (`[nŋ]` -> 2 members, `[t͡ʃk]` -> 2, `[tʃk]` -> 3,
`[tʃ k]` -> 2). Duplicates are dropped, and a member that is not in the inventory
is dropped at build time with a warning — if that empties the group, the shape is
skipped for that word rather than producing a sound the user does not have.

**An optional group wraps exactly ONE item**: `(C)` is legal, `(CC)` is a syntax
error, and so are `()` and `[]`. `TemplateItem` is a flat list with a per-item
`optional` flag, which has no representation for an all-or-nothing pair.

`parseTemplate` throws `TemplateSyntaxError` with a character position;
`isValidTemplatePattern` returns `{ ok } | { ok: false, message, position }`, and
the ShapeEditor prints exactly that message under the row (the weight box gets
the same treatment against `LIMITS.MIN_TEMPLATE_WEIGHT..MAX_TEMPLATE_WEIGHT`).
The settings validator calls the same function, so the page and the validator can
never disagree about what is legal.

### Constraints

Each rule is `(word, profile, inventory) => Violation | null`, run in order, with
`explainViolation` turning a violation into the sentence the shortfall banner
quotes.

| Rule | What it rejects |
|---|---|
| `inventoryOnly` | a sound that is not in the inventory (or is tilted `off`) |
| `noForbiddenSequences` | any `forbidden` entry, as a substring of the NORMALISED word |
| `noIllegalGeminates` | the same consonant (by identity) on both sides of a break, unless `allowGeminates` |
| `sonorityInClusters` | onsets that do not rise, codas that do not fall, and seams that do — see below |
| `clusterBudget` | more runs of ≥ 2 consonants than `maxPerWord` |
| `vowelHarmony` | a word mixing front and back vowels (`central` is neutral) |

**The Syllable Contact Law rides `clusters.sonority`** — it is a rider, not a
separate profile field. Sequencing alone only looks inside one syllable, which
let the engine emit `ɲonsimnlɛnɛw`-shaped words: every onset and coda legal,
every *seam* between them a sonority rise. With `sonority: true`, sonority across
a coda -> next-onset junction may fall or stay level and never rise
(`isValidContact`), and `splitMedialCluster` / `syllableUnits` re-read a
template's medial cluster by its vowel peaks so a `VCCV` shape is checked at all
(`arki` and `apka` pass; `atska` fails on the coda half). Measured over 500 words
× 7 presets, rising junctions went from 10–37 % to 0 %.

### The presets

| id | Name | Touchstones | Character |
|---|---|---|---|
| `flowing` | Elvish / flowing | Sindarin, Finnish, Welsh | Liquid consonants, open syllables, nothing that catches in the throat. |
| `island` | Smooth / island | Hawaiian, Samoan, Māori | A handful of consonants, every syllable open, long vowels doing the work. |
| `japanese` | Japanese-like | Japanese | Even CV beats, one nasal allowed to close a syllable, no l and no v. |
| `sinitic` | Sinitic | Mandarin, Cantonese | One or two short syllables, aspirated versus plain stops, only n and ŋ may close. |
| `romance` | Romance | Spanish, Italian, Portuguese | Five clean vowels, palatal ɲ and ʎ, words that end in a vowel or n, s, r, l. |
| `guttural` | Harsh / guttural | Arabic, Georgian, Klingon | Uvulars, ejectives and a glottal stop; heavy closed syllables and real clusters. |
| `slavic` | Slavic | Polish, Russian, Czech | Consonants stacked at the front of the syllable and sibilants at three places. |

Each preset carries `sounds { core, flavour, avoid }`, `vowels { core, flavour }`,
an optional `diphthongs` list, a complete `profile`, a `why` paragraph, and six
`examples` — which are **data, not computed at import time**. A preset module
must never run the engine on load, so the examples were generated once (seed 1,
count 6, the preset's own inventory) and pasted in;
`presets/__tests__/examples.test.ts` regenerates them and fails if they have gone
stale.

`applyPreset(preset, current)` overwrites the whole profile — templates,
constraints, inventory and tilt. A preset is a starting point; partial merges
produce contradictions the user cannot see. The generator page also offers "use
my script's sounds instead", which sets `inventory: []`.

### The IPA chart guide

`computeCoverage(preset, phonemes)` splits each tier into present/missing and
scores the core; `guideMapFor(preset)` returns `Map<base symbol, GuideTier>` for
the charts. Both compare by `phonemeIdentity` — canonical base plus its modifiers
as a set — so a user who typed `tʃ` matches a preset's `t͡ʃ`, `ɡ` matches `g`, and
`p` does **not** match `pʰ`.

| Tier | Meaning | Paint |
|---|---|---|
| `core` | the sounds the flavour is built from | `--status-good` ring + `--status-good-bg`; an unassigned core sound is the most visible thing on the chart |
| `flavour` | optional colour | `--status-info` ring + `--status-info-bg` |
| `avoid` | breaks the illusion (nothing stops you) | dimmed + `--status-disabled-bg`; an *assigned* one stays at 0.7 so your own work never disappears |

`--status-good` is 2.74:1 on the light page and is therefore a fill and a ring,
never a letter — a ratchet in `src/styles/__tests__/tokens.test.ts` enforces it.

The map is keyed by BASE symbol, because the chart draws base symbols: a preset
listing `pʰ` lights the `p` cell. The legend counts by base **plus modifiers**, so
its numbers and the lit cells can differ by design — `p` and `pʰ` are one cell and
two sounds.

Everything the guide paints has a cell to paint: `IPAExtraSoundsChart` sits
between the consonant table and the vowel trapezoid inside the same pannable
canvas, with four groups — Affricates (`IPA_AFFRICATES`, tie-bar spelling), Other
(the `EXTRA_SYMBOLS` the main charts lack), Clicks and Implosives. Its cells look
their grapheme up by `phonemeIdentity`, so a script that spells the sound `tʃ`
lights the `t͡ʃ` cell instead of being offered a duplicate grapheme. An audit
ratchet asserts the unpaintable set is empty for **every** preset.

The choice lives in `settings.wordGenerator.guidePresetId`, so it survives
navigation and reload and is the same choice the syllabary page and the generator
page see. Picking a preset in the generator sets it too — one mental model, "the
flavour". A stale id (a preset that no longer exists) shows "No guide" while the
raw value stays stored.

### The page

```
 ← Lexicon
 Word generator                          [ Words 10/20/50/100 ] [ Generate ]
 ┌ SOUNDS ─┬ SHAPES ─┬ WORDS IN LEXICON ┐
 ┌──────────────────────────┐ ┌─────────────────────────────────────┐
 │ 01 Flavour               │ │ 05 Words · 20 words · seed 105923…  │
 │ 02 Sounds                │ │ ☑ ta·ki·no  glyphs [Edit & add][Copy]│
 │ 03 Shape                 │ │ …                                    │
 │ 04 Constraints           │ │ [Add 1 selected][Select all][Regen…] │
 └──────────────────────────┘ └─────────────────────────────────────┘
```

- **`useGeneratorProfile` is the only source of truth.** It reads
  `settings.wordGenerator`, exposes `profile`, `updateProfile(patch)` (immediate,
  for switches/selects/buttons) and a 250 ms debounced variant with a flush on
  blur and unmount (for text and range inputs), plus `conlangPhonemes`,
  `inventory` and `existingPronunciations`. A patch may be a **function** of the
  profile at write time, so a debounced whole-array edit cannot write a stale
  list. There is no `useState` copy of the profile anywhere.
- **Every write sends the whole key.** `api.settings.update` replaces a nested
  key wholesale, so a partial `{ wordGenerator: { profile } }` would silently
  clear `guidePresetId`. A refused write toasts and keeps the draft text.
- **The batch is derived**, memoised on `(profile, inventory, count, seed,
  existing)` — not on `settings`, so an unrelated context tick (the persistence
  status ticking over) cannot reshuffle the words under the user.
- **The seed is shown, and reproducible.** "Regenerate" rolls a new one; "Same
  seed" re-runs the current one, which is how you see a profile change on the
  same words.
- A short batch renders the engine's own `shortfall` inline (a
  `NotificationBanner` forced to `position: static`), naming the reason and the
  rule that rejected most candidates.
- Nothing on this page is unsaved, so it does **not** register with the
  unsaved-changes registry. The prefilled word form does, once you type.

**SmartForm exemption.** The four profile sections are live settings, exactly
like `WritingSystemPage`: there is no submission, every control persists on
change, and there is nothing to validate at submit time. Wrapping them in
SmartForm would add a form lifecycle with no submit and a second source of truth
for values that already live in settings. The batch-add is a button, not a form.
The only real form on this path is the existing word form (`LexiconEditor` ->
`LexiconFormFields`), which *is* a SmartForm.

### Getting a word into the lexicon

Two paths, both from a result row:

- **"Edit & add"** links to `/lexicon/create?pronunciation=<ipa>`.
  `LexiconEditor` (create mode) reads the param and passes it as
  `initialPronunciation`; the field is prefilled and the form is **not** dirty, so
  the leave-guard stays quiet until the user actually types.
- **"Add N selected"** creates them directly, as auto-spelled words, so
  `lexicon.create` derives each spelling itself (see *One derivation,
  everywhere*). The generator still sends the `glyph_order` it previewed —
  `autoSpellToGlyphOrder(preview.spelling)` (`src/db/utils/spellingUtils.ts`),
  real graphemes as `"grapheme-<id>"`, virtual ones as the bare IPA character —
  which is the same value the derivation produces.

The loop runs inside **`batchMutations`** (on the context). Every mutation on
`api` refreshes the slices it can have changed, which is right for one call and
quadratic for a hundred: a 100-word batch used to run `lexicon.getAllComplete()`
a hundred times. Inside a batch the slices are only recorded, and the outermost
close refreshes each one **once** — even if the callback throws, so a
half-finished loop's work is still on screen. It is re-entrant (nested batches
flush once, at the outermost close) and it batches READS: nothing is rolled back.

```tsx
const { api, batchMutations } = useEtymolog();

batchMutations(() => {
    for (const word of chosen) api.lexicon.create({ /* … */ });
});   // <- one lexicon re-read happens here
```

One summary notice reports the whole batch (`useApiAction` is deliberately not
used: it reports per call, which for 100 words means 100 notices in a queue that
shows one at a time), failures are listed by IPA, and added rows leave the list
immediately — claimed through a ref rather than state, so a double-click cannot
create everything twice.

The engine dedupes against the lexicon (`existing`, normalised), so a word you
already have is never offered in the first place.

### Testing the generator

| Area | Files | What it pins |
|---|---|---|
| **Phonology** (`src/generator/phonology/__tests__/`) | `features`, `tokenize`, `sonority`, `classes`, `sources`, `audit` | every chart symbol resolves, both tie-bar spellings and the ligatures, voicing diacritics flipping `voiced`, the sonority table, class membership; `sources` is the ratchet that keeps React/db/DOM out of `src/generator/**` |
| **Profile & presets** (`profile/__tests__`, `presets/__tests__`, `__tests__/coverage`) | `validate`, `presets`, `examples`, `coverage` | absent key -> default with ZERO issues, every malformed field corrected with a prefixed path, every preset sound resolving, `core ∩ avoid = ∅`, ids unique, the six pasted examples regenerating identically |
| **Engine** (`src/generator/engine/__tests__/`) | `random`, `weights`, `template`, `constraints`, `normalize`, `generate` | determinism per seed, the attempt cap (a profile that can only make `a` returns a shortfall, it does not hang), every grammar case and its error position, zipf-vs-flat distribution, dedupe against `existing` |
| **Adversarial audits** (`src/generator/__tests__/`) | `audit-phase2`, `audit-phase3`, `quality-phase3b` | hostile JSON (`__proto__`, `NaN`, `-0`), a control-byte scan over `src/generator/**`, 7 presets × 300 words re-checked with INDEPENDENT code, and the flavour bands (zero rising junctions, monosyllable share, island's repeated vowels, romance's cluster onsets) |
| **Settings seam** (`src/db/__tests__/`) | `settingsWordGenerator`, `EtymologContext` | the `wordGenerator` key through the strict validator, the export envelope round-trip, and `batchMutations` (five creates -> one lexicon read; nested -> one; a throwing callback still flushes the successes) |
| **Guide overlay** (`src/components/display/ipaChart/__tests__/`) | `IPAChartCell.guide`, `charts.guide`, `IPAExtraSoundsChart`, `GuidePicker`, `GuideLegend`, `useGuidePreset`, `guideStyles`, `audit-phase4` | the painted set equals what the chart can DRAW (and the unpaintable set is EMPTY for every preset), the picker's payload surviving the REAL validator, the "why" toggle's `aria-expanded` and focus move, and a stylesheet ratchet that `--status-good` is never a text colour |
| **The page** (`src/components/tabs/lexicon/generator/__tests__/`) | `WordGeneratorPage`, `PresetPicker`, `InventoryEditor`, `ShapeEditor`, `ConstraintsEditor`, `GeneratedWordList`, `generatorText`, `audit-phase5` | full-key writes from all 13 controls and 4 text paths, `?preset=` applying once and only when it differs, the batch not regenerating on unrelated ticks, one batch and one notice for the add loop, and a double-click creating nothing twice |

---

## Testing

**2 616 tests across 136 files**, all green. Vitest, default environment `node`;
component tests opt in per file with `// @vitest-environment happy-dom` on line 1.
(The generic `TreeExplorer` primitive is tested in the cyber-components package's
own suite, not here.)

### By area

| Area | Files | What it covers |
|---|---|---|
| **Services** (`src/db/__tests__/`) | `glyphService`, `graphemeService`, `lexiconService`, `autoSpellService`, `phraseService`, `closureService`, `ancestry`, `spellingSourceOfTruth`, `translatorLogic`, `twoListArchitecture`, `edgeCases` | CRUD, the auto-spell DP algorithm, ancestry/closure maintenance, the one-spelling-source-of-truth rule, translator output |
| **Data safety** | `persistence`, `initDatabase`, `transaction`, `foreignKeys`, `migrations`, `repair`, `orphans`, `settingsApi`, `queryCount` | Debounce coalescing, CRC-mismatch → `previous` recovery, `QUOTA` surfacing, savepoint nesting, FK enforcement surviving an `export()`, every legacy-schema fixture migrating to the current version (fresh == migrated parity, incl. the v7/v8 folder tables), orphan repair counts, statement counts for the N+1 fixes |
| **Import/export** (`src/db/exportImport/__tests__/`) | `importSafety`, `jsonCodec`, `roundTrip`, `pixelCodec`, `crc32`, `glyphGraphemeFolders`, `threeDomainScenario` | A malformed row leaves the pre-import data intact, dangling children are pruned and reported, an imported closure is rebuilt, PNG round-trips losslessly, folders + memberships round-trip for all three domains (incl. a moved folder), v1/v2 exports import with empty folder tables, a dangling `folder_id` coerces to root |
| **Folders & tree** | `folderDomain`, `folderPersistence` (`src/db/__tests__/`), `DirectoryGallery`, `DirectoryGalleryCrud` (`src/components/shared/directory/__tests__/`), `GlyphFolders`, `GraphemeFolders`, `createInFolderLands`, `createInFolderRoute` (`src/components/tabs/grapheme/__tests__/`), `LexiconFolders` | The engine's cycle/depth/reparent/setItemFolder over all three domains (`describe.each`), folder mutations mark the DB dirty for persistence, flat↔tree switching, cap + Show-all focus, `?folder=` validation, localStorage corruption/pruning, per-card move round-trips, delete-reparents, create-in-folder landing, pickers staying flat |
| **Shared primitives** (`src/components/shared/**/__tests__/`) | `ConfirmDialogProvider`, `NotificationProvider`, `DialogPanel`, `PageHeader`, `LoadingState`, `FormActionBar`, `FieldHelp`, `EntityGallery`, `useGalleryState` | The promise contract behind every delete, the queue/auto-hide rules, label wiring, the derived-page gallery model |
| **Shell** (`src/components/shell/__tests__/`) | `AppShell`, `PersistenceStatus`, `PwaUpdateBanner` | Landmarks, tablist keyboard behaviour, dropdown mode under 480 px, the dirty registry blocking tab navigation, storage-error banner actions, the new-version notice yielding to every storage condition above it |
| **PWA updates** (`src/pwa/__tests__/`) | `updateController`, `usePwaUpdate`, `PwaUpdateGate` | The whole state machine against an injected `registerSW`: auto-apply only when the registry is clean, `flushPersist()` before the handover, the four triggers and their throttles, the re-arm after a cancelled reload, the store's referential stability, and the once-only "Updated to vX" boot notice |
| **Pages** (`src/components/tabs/**/__tests__/`) | `EntityEditLayout`, `ScriptMakerShell`, `GlyphPickerModal`, `GraphemeDeleteFlow`, `CustomChartsPage`, `LexiconEditor`, `LexiconViewPage`, `TranslatorHome`, `WritingSystemPage` | One CRUD paradigm, the respell-and-delete choice, not-found empty states, accessible names on every rule select |
| **Display / forms** | `GlyphSpellingDisplay`, `composedBlockStrategy`, `GlyphCanvasInput`, `glyphCanvasInput`, `normalizeGlyphSvg`, `virtualGlyph`, `ExportImportButtons` | Role-based word/line splitting, insertion strategies, `currentColor` normalisation on save, the header dropdown toggles being real buttons |
| **Block script** | `validate`, `classify`, `segment`, `compose` (`src/blocks/__tests__/`); `variants`, `variantsExport`, `blockScheme`, `blockBoundary`, `syllablePreview`, `EtymologContext` (`src/db/__tests__/`); `blocks`, `normalizationIdentity` (`display/spelling/__tests__/`); `syllabaryPreview` (`display/composedSyllable/__tests__/`); `translatorBlocks`; `graphemeVariants`; `blocksPage`, `templateEditor`, `blockSchemeDraft`, `seedFromGenerator`, `RectLayoutEditor`, `rectLayoutMath` (`tabs/writingSystem/**/__tests__/`); `blocks` (`glyphCanvasInput/__tests__/`); `validateWritingSystem` | Every scheme validation rule; first-template-wins segmentation and `.` splits; slot group → default fallback with `missingGroup`; pin precedence; the v8 → v9 migration and fresh/migrated parity; export round-trip and v1–v3 backfill; the no-scheme byte-identity snapshot; the designer's draft / save / reorder / seed; canvas outlines, pins through the popover, Split / Join, and the read-only lock |
| **Word generator core** (`src/generator/**/__tests__/`) | `features`, `tokenize`, `sonority`, `classes`, `sources`, `validate`, `presets`, `examples`, `coverage`, `random`, `weights`, `template`, `constraints`, `normalize`, `generate`, `inventory`, `audit-phase2`, `audit-phase3`, `quality-phase3b` | Symbol → features for every chart symbol, the template grammar and its error positions, determinism per seed and the attempt cap, every constraint re-checked with independent code over 7 presets × 300 words, and the flavour quality bands. See "Word generator → Testing the generator" |
| **Word generator UI** | `IPAExtraSoundsChart`, `charts.guide`, `GuidePicker`, `GuideLegend`, `useGuidePreset`, `audit-phase4`, `WordGeneratorPage`, `PresetPicker`, `InventoryEditor`, `ShapeEditor`, `ConstraintsEditor`, `GeneratedWordList`, `audit-phase5` | The overlay paints exactly what the charts can draw (and nothing is unpaintable), full-key settings writes from every control, one batch and one notice for the add loop |
| **Ratchets** | `src/styles/__tests__/tokens.test.ts`, `src/__tests__/url_mapping.test.ts`, `src/config/__tests__/version.test.ts` | Token vocabulary, no `var()` fallbacks, no colour literals, WCAG AA contrast in both themes; every `TAB_ROUTES` path exists in `ROUTES` |

### The happy-dom mount harness

There is no `@testing-library/react` in this workspace, so component tests mount
with `react-dom/client` directly. The shape every one of them uses:

```tsx
// @vitest-environment happy-dom
import { act } from 'react-dom/test-utils';   // React 18.3 — NOT from 'react'
import { createRoot, type Root } from 'react-dom/client';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(() => { try { act(() => root.unmount()); } catch { /* already gone */ } });
```

Reading a hook's value from a probe component: publish it from an **effect**,
never from the render body. Writing to an outer binding during render is a
render-phase side effect (`react-hooks/globals` flags it, and it is flagging
something real — React may discard or repeat a render). Effects flush inside
`act()`, so the value is there by the time the assertion runs.

Environment limits worth knowing:

- **No IndexedDB** in either environment — inject `createMemoryAdapter()` via
  `configurePersistence()`. Database tests stay in the `node` environment.
- **`offsetWidth` is 0** in happy-dom, so `TabContainer` never enters arrow
  mode; assert roles and keyboard behaviour, not layout.
- **`matchMedia` must be mocked** for `DarkmodeSwitch` and for dropdown mode.
- `setup.ts` sets `__ETYMOLOG_ALLOW_UNSANITIZED_SVG__` (DOMPurify needs a DOM);
  a happy-dom test file has to set it itself.

### Running tests

```bash
cd apps/etymolog

npx vitest run                       # everything
npx vitest run src/db                # one area
npx vitest run src/styles            # the token + contrast ratchet
npx vitest                           # watch mode

# The two packages this app changes
cd ../../packages/cyber-components && npx vitest run --config vitest.config.mts
cd ../../packages/smart-form        && npx vitest run
```

### Quality gates

| Gate | Command | Expected |
|---|---|---|
| Tests | `npx vitest run` | all green |
| Types | `npx tsc -p tsconfig.app.json --noEmit 2>&1 \| grep -v packages/` | 0 errors |
| Lint | `npx eslint .` | 0 errors, 0 warnings |
| Build | `npx vite build` | writes `docs/` (the committed static site) |

---

## Development

```bash
# From the repo root, once
pnpm install                 # NEVER from inside a git worktree — see below

cd apps/etymolog
pnpm dev                     # dev server (base path is /etymolog/)
npx vitest run               # tests
npx eslint .                 # lint  (target: 0 errors, 0 warnings)
npx vite build               # production build -> docs/
```

Open **`http://localhost:5173/etymolog/`** — the `/etymolog/` base is not
optional, the app is built for a GitHub Pages subpath.

**Working in a git worktree** (`.claude/worktrees/<name>`): `node_modules` there
is an NTFS junction to the main repo, so `pnpm install` from a worktree
corrupts the shared store. Use `pnpm install --frozen-lockfile` if you must, and
repair from the main tree with `pnpm install --force`. Each worktree runs the
dev server on its own port (omega +1 → 5174, and so on).

**`vite build` writes into `docs/`**, the committed static site. Build freely to
verify, then `git checkout -- docs` (and delete the new untracked
`docs/assets/*` / `docs/workbox-*.js` files) unless the commit you are making
*is* the site rebuild.

---

## Known Issues

Open items and things a human still has to decide live in
[`todo.md`](./todo.md). What is listed here is behaviour that is *by design* and
looks like a bug, plus traps that have bitten more than once.

### Traps

- **Nested SmartForms rely on `stopPropagation`.** The "new glyph while
  composing a grapheme" modal is a `<SmartForm>` inside a `<SmartForm>`. HTML
  submit events do not bubble, but React's synthetic event system propagates
  through the component tree — including through portals — so `useSmartForm`'s
  handler calls `event.stopPropagation()` as well as `preventDefault()`. Remove
  it and submitting the glyph also submits the grapheme.
- **`api.settings.update()` is strict.** An unknown key or a bad enum value
  rejects the WHOLE update with `VALIDATION_ERROR`. Always spread the current
  nested object: `{ writingSystem: { ...settings.writingSystem, wordWrap } }`.
- **Deleting a grapheme used by words** returns `CONSTRAINT_VIOLATION` with
  `details.lexiconCount`. Pass `{ respellLexicon: true }` to proceed (that is
  what the confirm dialog's "Respell and delete" does);
  `api.grapheme.getLexiconUsage(id)` lists the words. Auto-spelled words with a
  pronunciation are then **regenerated** against the remaining graphemes (so
  a duplicate grapheme for the same sound takes over), not just given a
  placeholder — see [Auto-spelled words follow the script](#auto-spelled-words-follow-the-script--srcdbrespellservicets).
- **Every `api.phoneme.*` write respells.** Editing a grapheme's phoneme list
  row by row (`deleteAllForGrapheme` + N × `add`) respells N+1 times; use
  `phoneme.replaceAll` for one transaction and one pass.
- **`import NavigationGuard from 'cyber-components/container/navigationGuard'`
  is `undefined` at runtime.** That index re-exports the component by NAME only;
  the default import typechecks under `allowSyntheticDefaultImports` and then
  fails as "Element type is invalid". Import it by name.
- **A `forwardRef` render function must declare two parameters** even when the
  ref is unused, or React warns on every mount. `AncestryInput` and
  `MeaningTableInput` keep `_ref` behind an eslint exemption.
- **cyber-components that import Next.js cannot be used here** (see
  [Design System](#cyber-components-used)) — they fail at RESOLVE time.

### By design

- **Settings live in `localStorage`, not in the database.** They travel with a
  **JSON or PNG export** (the envelope embeds them and `importSettings`
  restores them). A raw `.sqlite` file carries tables only, so a conlang moved
  that way arrives with the receiving browser's settings. Use JSON or PNG to
  move a conlang between machines.
- **Two `<main>` nodes exist for ~300 ms after a tab switch.** The panel
  crossfades old and new with `AnimatePresence`; both are in the DOM until the
  exit finishes. Under `prefers-reduced-motion: reduce` the swap is instant. (In
  a hidden/background browser tab rAF is frozen, so the exits never complete and
  the copies accumulate — an environment artifact, not a leak.)
- **Block-script pins are manual-spelling only.** An auto-spelled word never
  keeps a `grapheme-12@34` pin (saving or respelling derives a plain spelling),
  and with blocks switched off the display draws the default form even for a
  pinned entry. The full list is under
  [Block script → Limitations](#limitations-by-design-or-known).
- **The theme cookie is host-only** (`theme-preference`, `path=/`): on
  `localhost` it is shared with the other dev apps in this monorepo regardless
  of port. Expected, not a bug.

### Database migrations

Schema versioning lives in `src/db/migrations/`:

| File | Responsibility |
|------|----------------|
| `version.ts` | `CURRENT_SCHEMA_VERSION` (currently **9**) |
| `schema.ts` | `createSchema(db)` — the full current DDL for a fresh database; stamps `PRAGMA user_version = CURRENT_SCHEMA_VERSION` |
| `index.ts` | `MIGRATIONS` registry, `detectLegacySchemaVersion(db)`, `runMigrations(db)` |
| `repair.ts` | `repairOrphans(db)` — prunes rows whose parent is gone, rewrites dangling `glyph_order` references, rebuilds the closure table |

**`PRAGMA user_version` is the source of truth.** Every database carries its schema version in the SQLite header: `createSchema()` stamps the current version on a fresh database, and `runMigrations()` reads the stamp, applies every `MIGRATIONS` entry with a higher version — each inside its own transaction together with the `user_version` bump, so a crash mid-migration leaves the previous stamp and the previous data — and returns `{ from, to, applied }`. A second run applies nothing. The same pipeline runs at boot (`initDatabase`) and on raw SQLite import (`importDatabaseFile`); `persistence` additionally records the version alongside each snapshot.

**Unversioned files** (everything written before this registry existed have `user_version = 0`) are classified by `detectLegacySchemaVersion()`, which probes `sqlite_master` / `PRAGMA table_info` the way the old boot-time if-chains did and returns the version the file is *at*, so the registry resumes from the right entry. Migration `N` upgrades a version `N-1` database to `N`:

| Version | Migration |
|---------|-----------|
| 0 | Original Glyph → Grapheme → Phoneme schema, no `category` columns (or no Etymolog schema at all → `createSchema`) |
| 1 | `category` columns on `glyphs` / `graphemes` |
| 2 | `lexicon`, `lexicon_spelling`, `lexicon_ancestry` |
| 3 | `lexicon_ancestry_closure` |
| 4 | `lexicon.glyph_order` + `needs_attention`, backfilled from `lexicon_spelling` |
| 5 | `lexicon_meanings`, backfilled from `lexicon.meaning` |
| 6 | Rebuild `lexicon_ancestry` so `ancestor_id` is `NOT NULL ... ON DELETE CASCADE` (the previous `NOT NULL` + `ON DELETE SET NULL` could never be satisfied), then `repairOrphans`, then rebuild the closure table |
| 7 | `lexicon_folders` (self-referential tree) + `lexicon.folder_id ... ON DELETE SET NULL` — nested folders for the lexicon |
| 8 | `glyph_folders` and `grapheme_folders` (structural clones of `lexicon_folders`) + `glyphs.folder_id` / `graphemes.folder_id ... ON DELETE SET NULL` — folders for the other two domains. In the fresh DDL each folder table is created BEFORE its item table (FK order); the migration reuses the same DDL functions, then `ALTER TABLE ... ADD COLUMN`, indexes, and a `foreignKeyViolationCount()` assert |
| 9 | `variant_groups`, `grapheme_variants` (partial unique index: one default per grapheme; unique `(grapheme_id, group_id)`) and the single-row `block_scheme`; a 'Default' variant per grapheme (`backfillDefaultVariants`); then a rebuild of `grapheme_glyphs` with `variant_id NOT NULL` and `UNIQUE(variant_id, glyph_id, position)`, every row attached to its grapheme's default (orphan rows dropped by the join), the AUTOINCREMENT high-water mark kept, indexes recreated after the `DROP`, and a `foreignKeyViolationCount()` assert. Runs `foreignKeysOff: true`; the table is created by the same `createGraphemeGlyphsTable()` as a fresh database, so `sqlite_master` matches. See [Block script](#block-script-abugida--mayan-style-glyph-blocks) |

Migrations v6 and v9 are SQLite table rebuilds, so they run with `PRAGMA foreign_keys = OFF` — toggled by the runner *outside* the transaction (the pragma is a no-op inside one) — and finish with their own `PRAGMA foreign_key_check`, so an inconsistent rebuild throws and rolls back instead of committing.

**Repair path.** Foreign keys were not enforced before Phase 1, so older files may hold orphaned junction rows, spellings or closure entries that would make a later `DELETE` fail with "FOREIGN KEY constraint failed". `repairOrphans` runs as part of v6, on import when `foreign_key_check` reports rows (a file still inconsistent afterwards is refused), and on demand through `databaseApi.repair()` (`RepairReport` counts per category; `total === 0` means nothing needed fixing). `databaseApi.getStatus().schemaVersion` exposes the live `user_version`; `getDatabaseHealth()` carries `fkViolations` and the boot-time `schemaMigration` result.

**Adding a migration:** append to `MIGRATIONS`, bump `CURRENT_SCHEMA_VERSION`, update `createSchema()` so a fresh database matches a migrated one, and add a fixture to `src/db/__tests__/fixtures/legacySchemas.ts` — `migrations.test.ts` drives every fixture to the current version and checks the fresh path against it.

---

## Deployment (GitHub Pages)

The public site is **https://kerbash.github.io/etymolog/**. It is served by
GitHub Pages from a **separate mirror repository**, `Kerbash/etymolog`
(branch `main`, folder `/docs`), which holds a snapshot of this
`apps/etymolog` directory — source plus the committed build output.

Two facts drive the procedure below:

- `vite build` writes to the **committed** `docs/` folder (`outDir: 'docs'` in
  `vite.config.ts`, base `/etymolog/`). The footer stamps the version and git
  SHA at build time, so the build must happen **after** the version-bump commit.
- The mirror is a snapshot, not a buildable checkout (the app depends on
  `workspace:*` packages that only exist in this monorepo). Nothing is built in
  the mirror; it is `git archive` output plus two mirror-only files.

### Release procedure

1. In a worktree, bump and build:

   ```bash
   node scripts/version-bump.mjs etymolog patch   # or minor / major — edits apps/etymolog/package.json only
   git commit -m "(etymolog): bump version to X.Y.Z - ..." apps/etymolog/package.json
   cd apps/etymolog && npx vite build             # rewrites docs/
   git add apps/etymolog/docs && git commit -m "(etymolog): rebuild static docs site (vX.Y.Z)"
   ```

   Run the gates first (`npx vitest run`, `npx tsc -p tsconfig.app.json --noEmit | grep -v packages/`,
   `npx eslint src --max-warnings=0`). Merge to `master` and push.

2. Snapshot into the mirror:

   ```bash
   git clone https://github.com/Kerbash/etymolog.git mirror && cd mirror
   # wipe everything except .git, LICENSE and .github, then:
   git -C <monorepo> archive master apps/etymolog | tar -x --strip-components=2
   git checkout HEAD -- .gitignore docs/.nojekyll   # mirror-only files; .nojekyll keeps Jekyll off
   git add -A . && git commit -m "deploy vX.Y.Z: ..." && git push origin main
   ```

3. Verify: `gh api repos/Kerbash/etymolog/pages/builds/latest` reports `built`
   for the new SHA, and the live `assets/index-*.js` contains the new version.

### How users receive an update

Since v0.2.1 the app updates itself — see [In-app updates (PWA)](#in-app-updates-pwa).
A running tab polls for the new service worker, installs it in the background
and reloads as soon as no editor has unsaved input. Users do not need to
force-refresh. The one exception was the upgrade *to* 0.2.1: tabs still
controlled by the old `autoUpdate` worker cannot be told about the new
behaviour, and iOS Safari in particular keeps serving the cached bundle until
every tab of the site is closed and reopened.

### The monorepo workflow is dead

`.github/workflows/deploy-gh-pages.yml` at the repo root has never deployed
anything: it triggers on a `main` branch (this repo's default is `master`),
pins Node 18 (Vite 7 needs ≥ 20.19) and would publish to a `gh-pages` branch
nothing serves. The monorepo has no Pages site. Do not expect it to run; the
mirror procedure above is the only deployment path.

---

## Architecture Notes

### Design principles

1. **Modularity.** One implementation per job: one gallery model
   (`useGalleryState` + `EntityGallery` + `EntityCard`) behind three bindings,
   one confirmation dialog, one notification surface, one loading presentation,
   one chart-page skeleton, one entity-edit layout. Adding a fourth gallery or a
   tenth delete modal is the thing this structure exists to prevent.
2. **Performance.** List queries are O(1) statements, not O(n)
   (`getAllLexiconComplete` is four statements grouped in JS;
   `getAllGraphemesComplete` is three — pinned by `queryCount.test.ts`). Mutations
   refresh only the slices they can have changed (the refresh matrix in
   `EtymologProvider`), writes are one transaction and one debounced save, and
   descendant lookups read the closure table instead of a recursive CTE.
3. **Functionality.** Glyph drawing, grapheme composition, phoneme mapping,
   auto-spelling, etymology with cycle detection, eight layout strategies,
   punctuation configuration, custom charts, and lossless JSON/PNG export.

### Strengths

- **Two-layer separation.** `UI → useEtymolog() → EtymologApi → service → sql.js`.
  No component imports sql.js, and every API call returns the same
  `ApiResponse<T>` envelope.
- **No silent failure paths.** Refresh errors land in `data.lastRefreshError`,
  storage errors raise a banner with Retry / Export / Repair, and
  `useApiAction()` notifies on `!success` — replacing 22 bare `console.error`
  calls.
- **Ratcheted invariants.** Token vocabulary, `var()` fallbacks, colour
  literals, WCAG AA contrast, route/tab agreement and statement counts all fail a
  test rather than a code review.
- **Accessibility built in, not bolted on.** Landmarks, one `<h1>`, `<h2>` page
  titles, a skip link, an accessible name on every control, one app-wide
  `:focus-visible` ring, and an unsaved-changes guard on every edit surface.

### Remaining opportunities

| # | Item | Notes |
|---|---|---|
| 1 | **Conlang settings in SQLite** | Would make settings travel with a raw `.sqlite` file too. A `settings(key, value, type)` table plus a migration; the JSON/PNG envelope would keep embedding them for older importers. Tracked in `todo.md`. |
| 2 | **Self-hosted fonts** | The PWA is offline-capable but Chakra Petch / Bitcount Prop Single are still fetched from googleapis on first load. Needs the binaries committed plus the OFL notice — a licensing decision. |
| 3 | **Render memoisation** | `React.memo` on `GlyphCard` and `CompactGraphemeDisplay`, an SVG sprite cache for frequently reused glyphs, debounced grapheme preview. Not currently a measured problem. |
| 4 | **Unused dependencies** | `style-switcher` and `nochi-oauth` are declared but imported nowhere. Removing them changes `pnpm-lock.yaml`, which must be done from the MAIN tree. |

### Future enhancements

| Priority | Feature | Description |
|----------|---------|-------------|
| **High** | Settings migration to SQLite | Make conlang settings portable on every export path |
| **Medium** | Graphotactic rules | Define valid grapheme sequences |
| **Medium** | Part-of-speech table | Formal `part_of_speech` management with a foreign key |
| **Medium** | Glyph transforms | Rotation and scaling in grapheme composition |
| **Low** | Collaborative editing | Would need a server; the two-layer split is the seam for it |

---

## Contributing

1. **Follow the two-layer architecture.** UI reads through `useEtymolog()`; only
   services touch sql.js, and only inside `withTransaction`.
2. **Reuse the primitives.** Before writing a modal, a loading state, an empty
   state, a gallery, a page header or a confirmation, check
   `src/components/shared/` — there is already one of each, and the point of
   this structure is that there stays one of each.
3. **Colours, radii and shadows come from `index.css`.** No literals, no
   `var(--x, #hex)` fallbacks. `src/styles/__tests__/tokens.test.ts` enforces it,
   contrast included.
4. **Every route goes in `src/url_mapping.ts`** and is built with
   `resolveUrl()`. `TAB_ROUTES` is the single source for the nav strip, the
   route tree and the active-tab derivation.
5. **Add tests with the change**, in the area folder it belongs to, and keep the
   three gates green: `npx vitest run`, `npx tsc -p tsconfig.app.json --noEmit`,
   `npx eslint .`.
6. **Ordered relationships use the junction-table pattern** (`grapheme_glyphs`,
   `lexicon_spelling`) with an explicit `position`, and the owning column stays
   the source of truth.
7. **Forms use SmartForm**, submit buttons are `disabled={!formState.isSubmittable}`,
   and every other button in a form carries `type="button"`.
8. **Update this README** when a route, a primitive or a data invariant changes.

---

*Last updated: August 22, 2026 (Phase 8 — hardening and release)*
