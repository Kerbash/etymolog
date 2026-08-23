# Etymolog

A conlang (constructed language) script creation and management tool. Create custom writing systems with glyphs, graphemes, and their associated phonemes (pronunciations).

## Table of Contents
- [Quick Start](#quick-start)
- [Global Settings](#global-settings-new)
- [Use Cases & Requirements](#use-cases--requirements)
- [Application Architecture](#application-architecture)
- [Data Layer](#data-layer)
- [Route Structure](#route-structure)
- [Design System (tokens & shared primitives)](#design-system-tokens--shared-primitives)
- [App shell](#app-shell-srccomponentsshell)
- [Component Architecture](#component-architecture)
- [Auto-Manage Glyphs](#auto-manage-glyphs-feature)
- [Punctuation & Separators](#punctuation--separators-new)
- [Word generator](#word-generator-new)
- [Testing](#testing)
- [Development](#development)
- [Known Issues](#known-issues)
- [GitHub Pages Deployment](#github-pages-deployment-quick)
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
| Writing System | `/writing-system` | Directional layout rules |
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
[Database migrations](#database-migrations).

### One spelling source of truth

`lexicon.glyph_order` (a JSON array of `grapheme-<id>` entries and bare IPA
characters) **is** a word's spelling. The `lexicon_spelling` junction table is a
derived index, resynced from `glyph_order` inside the same transaction:

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
├── /writing-system                → WritingSystemMain (PageHeader + GeneralTab)
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
| `/writing-system` | `WritingSystemMain` | Directional layout rules |
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
        └── GraphemeMain (/script-maker)
            └── TabContainer (nested Graphemes / Glyphs strip, router-driven)
                ├── GraphemesTab
                │   ├── GraphemeHome
                │   │   ├── GraphemeNav
                │   │   │   ├── IconButton → /script-maker/create
                │   │   │   └── IconButton → /script-maker/chart
                │   │   └── GraphemeView
                │   │       └── DataGallery (cyber-components)
                │   │           └── CompactGraphemeDisplay
                │   ├── CreateGraphemePage
                │   │   └── NewGraphemeForm
                │   │       └── SmartForm
                │   │           └── GraphemeFormFields
                │   │               ├── GlyphCard (modal mode)
                │   │               ├── LabelShiftTextInput (×3)
                │   │               ├── PronunciationTableInput
                │   │               ├── NewGlyphModal
                │   │               │   └── GlyphForm
                │   │               │       └── GlyphFormFields
                │   │               └── EditGlyphModal
                │   │                   └── GlyphForm
                │   │                       └── GlyphFormFields
                │   ├── IPAChartPage
                │   │   ├── GuidePicker              (header action)
                │   │   ├── IPACombinedChart
                │   │   │   ├── IPAConsonantChart
                │   │   │   │   └── IPAChartCell (×N)
                │   │   │   │       └── GlyphSpellingDisplay (if assigned)
                │   │   │   ├── IPAExtraSoundsChart  (affricates, clicks, …)
                │   │   │   │   └── IPAChartCell (×N)
                │   │   │   └── IPAVowelChart
                │   │   │       └── IPAChartCell (×N)
                │   │   │           └── GlyphSpellingDisplay (if assigned)
                │   │   └── GuideLegend              (below the chart, never inside it)
                │   └── GraphemeEditPage
                │       └── SmartForm
                │           └── GraphemeFormFields (mode="edit")
                │
                └── GlyphsTab
                    ├── GlyphGallery
                    │   └── DataGallery (with toolbarEndSlot)
                    │       ├── GlyphCard (route mode)
                    │       └── [Auto-manage toggle via CyberSwitch]
                    ├── NewGlyphPage
                    │   └── GlyphForm
                    │       └── GlyphFormFields
                    └── GlyphEditPage
                        └── SmartForm
                            └── GlyphFormFields (mode="edit")
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
- **"Add N selected"** creates them directly. `createLexicon` stores what it is
  given and never auto-spells, so each word is created with an explicit
  `glyph_order` built by `autoSpellToGlyphOrder(preview.spelling)`
  (`src/db/utils/spellingUtils.ts`) from the same preview the row is showing —
  real graphemes become `"grapheme-<id>"`, virtual ones the bare IPA character.

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

**~2 200 tests across 106 files**, all green. Vitest, default environment `node`;
component tests opt in per file with `// @vitest-environment happy-dom` on line 1.

### By area

| Area | Files | What it covers |
|---|---|---|
| **Services** (`src/db/__tests__/`) | `glyphService`, `graphemeService`, `lexiconService`, `autoSpellService`, `phraseService`, `closureService`, `ancestry`, `spellingSourceOfTruth`, `translatorLogic`, `twoListArchitecture`, `edgeCases` | CRUD, the auto-spell DP algorithm, ancestry/closure maintenance, the one-spelling-source-of-truth rule, translator output |
| **Data safety** | `persistence`, `initDatabase`, `transaction`, `foreignKeys`, `migrations`, `repair`, `orphans`, `settingsApi`, `queryCount` | Debounce coalescing, CRC-mismatch → `previous` recovery, `QUOTA` surfacing, savepoint nesting, FK enforcement surviving an `export()`, every legacy-schema fixture migrating to v6, orphan repair counts, statement counts for the N+1 fixes |
| **Import/export** (`src/db/exportImport/__tests__/`) | `importSafety`, `jsonCodec`, `roundTrip`, `pixelCodec`, `crc32` | A malformed row leaves the pre-import data intact, dangling children are pruned and reported, an imported closure is rebuilt, PNG round-trips losslessly |
| **Shared primitives** (`src/components/shared/**/__tests__/`) | `ConfirmDialogProvider`, `NotificationProvider`, `DialogPanel`, `PageHeader`, `LoadingState`, `FormActionBar`, `FieldHelp`, `EntityGallery`, `useGalleryState` | The promise contract behind every delete, the queue/auto-hide rules, label wiring, the derived-page gallery model |
| **Shell** (`src/components/shell/__tests__/`) | `AppShell`, `PersistenceStatus`, `PwaUpdateBanner` | Landmarks, tablist keyboard behaviour, dropdown mode under 480 px, the dirty registry blocking tab navigation, storage-error banner actions, the new-version notice yielding to every storage condition above it |
| **PWA updates** (`src/pwa/__tests__/`) | `updateController`, `usePwaUpdate`, `PwaUpdateGate` | The whole state machine against an injected `registerSW`: auto-apply only when the registry is clean, `flushPersist()` before the handover, the four triggers and their throttles, the re-arm after a cancelled reload, the store's referential stability, and the once-only "Updated to vX" boot notice |
| **Pages** (`src/components/tabs/**/__tests__/`) | `EntityEditLayout`, `ScriptMakerShell`, `GlyphPickerModal`, `GraphemeDeleteFlow`, `CustomChartsPage`, `LexiconEditor`, `LexiconViewPage`, `TranslatorHome`, `WritingSystemPage` | One CRUD paradigm, the respell-and-delete choice, not-found empty states, accessible names on every rule select |
| **Display / forms** | `GlyphSpellingDisplay`, `composedBlockStrategy`, `GlyphCanvasInput`, `glyphCanvasInput`, `normalizeGlyphSvg`, `virtualGlyph`, `ExportImportButtons` | Role-based word/line splitting, insertion strategies, `currentColor` normalisation on save, the header dropdown toggles being real buttons |
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
  `api.grapheme.getLexiconUsage(id)` lists the words.
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
- **The theme cookie is host-only** (`theme-preference`, `path=/`): on
  `localhost` it is shared with the other dev apps in this monorepo regardless
  of port. Expected, not a bug.

### Database migrations

Schema versioning lives in `src/db/migrations/`:

| File | Responsibility |
|------|----------------|
| `version.ts` | `CURRENT_SCHEMA_VERSION` (currently **6**) |
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

Migration v6 is a SQLite table rebuild, so it runs with `PRAGMA foreign_keys = OFF` — toggled by the runner *outside* the transaction (the pragma is a no-op inside one) — and finishes with its own `PRAGMA foreign_key_check`, so an inconsistent rebuild throws and rolls back instead of committing.

**Repair path.** Foreign keys were not enforced before Phase 1, so older files may hold orphaned junction rows, spellings or closure entries that would make a later `DELETE` fail with "FOREIGN KEY constraint failed". `repairOrphans` runs as part of v6, on import when `foreign_key_check` reports rows (a file still inconsistent afterwards is refused), and on demand through `databaseApi.repair()` (`RepairReport` counts per category; `total === 0` means nothing needed fixing). `databaseApi.getStatus().schemaVersion` exposes the live `user_version`; `getDatabaseHealth()` carries `fkViolations` and the boot-time `schemaMigration` result.

**Adding a migration:** append to `MIGRATIONS`, bump `CURRENT_SCHEMA_VERSION`, update `createSchema()` so a fresh database matches a migrated one, and add a fixture to `src/db/__tests__/fixtures/legacySchemas.ts` — `migrations.test.ts` drives every fixture to the current version and checks the fresh path against it.

---

## GitHub Pages Deployment (quick)

This repository includes a GitHub Actions workflow to build and publish the `apps/etymolog` Vite app to GitHub Pages.

- Workflow: `.github/workflows/deploy-gh-pages.yml` (builds `apps/etymolog` and publishes `apps/etymolog/dist` to the `gh-pages` branch).
- By default the workflow sets `GH_PAGES_BASE` to `/etymolog/`. Replace that value in the workflow if you publish to a different repository name.

Local build for GitHub Pages (replace REPO_NAME and run from the app folder):

```powershell
# from repo root
cd D:\Coding\Javascript\greatest-Monorepo
pnpm install
# then build with the repo base
cd apps\etymolog
$env:GH_PAGES_BASE = '/REPO_NAME/'
pnpm build
```

After pushing `main` to GitHub the workflow will run and publish the site at:

    https://<GITHUB_USER>.github.io/REPO_NAME/

If you'd like, I can: create the remote GitHub repository, add the `gh`-CLI commands to your workflow, or adjust the base name to your chosen repo — tell me the desired repo name and whether you want me to push the code for you.

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
