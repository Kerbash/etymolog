# Etymolog

A conlang (constructed language) script creation and management tool. Create custom writing systems with glyphs, graphemes, and their associated phonemes (pronunciations).

## Table of Contents
- Quick Start
- Global Settings (new)
- Use Cases & Requirements
- Application Architecture
- Route Structure
- Component Architecture
- Form Architecture
- Data Architecture
- Two-Layer Architecture
- API Reference
- SQL Structure
- File Structure
- Testing
- Development
- Known Issues & Fixes
- Punctuation & Separators (new)

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
┌─────────────────────────────────────────────────────────────────────────────┐
│                                  App.tsx                                     │
│                           (EtymologProvider)                                │
│                                    │                                         │
│                          RouterTabContainer                                  │
│                    ┌───────────────┼───────────────┐                        │
│                    │               │               │                        │
│               ┌────▼────┐   ┌──────▼──────┐  ┌─────▼─────┐                  │
│               │ Lexicon │   │Script Maker │  │Graphotactic│                  │
│               │  /lexicon │  │/script-maker│  │    (WIP)  │                  │
│               └─────────┘   └──────┬──────┘  └───────────┘                  │
│                                    │                                         │
│                          ┌─────────┴─────────┐                              │
│                          │                   │                              │
│                    ┌─────▼─────┐       ┌─────▼─────┐                        │
│                    │ Graphemes │       │  Glyphs   │                        │
│                    │  (default)│       │ /glyphs   │                        │
│                    └───────────┘       └───────────┘                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Tab Sections

| Tab | Path | Description | Status |
|-----|------|-------------|--------|
| Lexicon | `/lexicon` | Word/vocabulary management | ✅ Complete |
| Part of Speech | `/part-of-speech` | Grammar categories | 🚧 Placeholder |
| Script Maker | `/script-maker` | Grapheme & glyph management | ✅ Complete |
| Graphotactic | `/graphotactic` | Writing system rules | 🚧 Placeholder |

---

## Route Structure

### Complete Route Map

```
/
├── /lexicon                        → LexiconMain
│   ├── (index)                     → LexiconHome (gallery + search/filter)
│   ├── /create                     → CreateLexiconPage (create form)
│   └── /db/:id                     → LexiconViewPage (view/edit + etymology tree)
│
├── /part-of-speech                 → Placeholder
│
├── /script-maker                   → GraphemeMain (RouterTabContainer)
│   ├── (index: Graphemes Tab)      
│   │   ├── (index)                 → GraphemeHome (gallery + nav)
│   │   ├── /create                 → CreateGraphemePage
│   │   ├── /chart                  → IPAChartPage (IPA chart viewer)
│   │   ├── /punctuation            → PunctuationPage (punctuation settings)
│   │   └── /grapheme/db/:id        → GraphemeEditPage
│   │
│   └── /glyphs (Glyphs Tab)
│       ├── (index)                 → GlyphsTab (gallery + nav)
│       ├── /create                 → NewGlyphPage
│       └── /db/:id                 → GlyphEditPage
│
└── /graphotactic                   → GraphotacticMain (placeholder)
```

### Route Details

| Route | Component | Description |
|-------|-----------|-------------|
| `/lexicon` | `LexiconHome` | Lexicon gallery with search/filter/sort |
| `/lexicon/create` | `CreateLexiconPage` | Create new word with spelling and ancestry |
| `/lexicon/db/:id` | `LexiconViewPage` | View/edit word + etymology tree |
| `/script-maker` | `GraphemeHome` | Grapheme gallery with search/sort/pagination |
| `/script-maker/create` | `CreateGraphemePage` | Create new grapheme with glyph selection |
| `/script-maker/chart` | `IPAChartPage` | Interactive IPA consonant & vowel charts |
| `/script-maker/punctuation` | `PunctuationPage` | Configure punctuation marks and separators |
| `/script-maker/grapheme/db/:id` | `GraphemeEditPage` | Edit existing grapheme |
| `/script-maker/glyphs` | `GlyphsTab` | Glyph gallery with search/sort/pagination |
| `/script-maker/glyphs/create` | `NewGlyphPage` | Create new glyph (standalone page) |
| `/script-maker/glyphs/db/:id` | `GlyphEditPage` | Edit existing glyph |

---

## Component Architecture

### Component Hierarchy

```
App.tsx
└── EtymologProvider (Context)
    └── RouterTabContainer (cyber-components)
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
        │   └── LexiconViewPage
        │       ├── DetailedLexiconDisplay
        │       ├── EtymologyTree
        │       │   └── EtymologyTreeNode (recursive)
        │       └── SmartForm (edit mode)
        │           └── LexiconFormFields
        │
        └── GraphemeMain (/script-maker)
            └── RouterTabContainer (nested tabs)
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
                │   │   ├── IPAConsonantChart
                │   │   │   └── IPAChartCell (×N)
                │   │   │       └── GlyphSpellingDisplay (if assigned)
                │   │   └── IPAVowelChart
                │   │       └── IPAChartCell (×N)
                │   │           └── GlyphSpellingDisplay (if assigned)
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
| **Tab Containers** | `GraphemeMain`, `LexiconMain`, `GraphotacticMain` | `src/components/tabs/*/main.tsx` |
| **Galleries** | `GraphemeView`, `GlyphGallery`, `LexiconGallery` | `src/components/tabs/*/gallery*/` |
| **Create Pages** | `CreateGraphemePage`, `NewGlyphPage`, `CreateLexiconPage` | `src/components/tabs/*/create*/` or `new*/` |
| **Edit/View Pages** | `GraphemeEditPage`, `GlyphEditPage`, `LexiconViewPage` | `src/components/tabs/*/edit*/` or `view*/` |
| **IPA Chart** | `IPAChartPage`, `IPAConsonantChart`, `IPAVowelChart`, `IPAChartCell` | `src/components/tabs/grapheme/ipaChart/`, `src/components/display/ipaChart/` |
| **Form Components** | `GlyphFormFields`, `GraphemeFormFields`, `LexiconFormFields` | `src/components/form/*/` |
| **Display Components** | `GlyphCard`, `CompactGraphemeDisplay`, `DetailedGraphemeDisplay`, `CompactLexiconDisplay`, `DetailedLexiconDisplay`, `EtymologyTree`, `GlyphSpellingDisplay` | `src/components/display/*/` |
| **Custom Inputs** | `PronunciationTableInput`, `SpellingInput`, `AncestryInput` | `src/components/form/customInput/*/` |
| **Modal Components** | `NewGlyphModal`, `EditGlyphModal` | Various locations |

### Gallery Features

#### GlyphGallery

The glyph gallery (`src/components/tabs/grapheme/galleryGlyphs/galleryGlyphs.tsx`) provides:

- **Search & Filter**: Search glyphs by name
- **Sorting**: Sort by name (A-Z, Z-A) or usage count (most/least used)
- **Pagination**: Configurable results per page (12, 24, 48, 96)
- **Keyboard Navigation**: Roving tabindex with arrow key support
- **Auto-manage Toggle**: A `CyberSwitch` in the toolbar allows toggling the `autoManageGlyphs` setting
  - Located in the toolbar's end slot via `toolbarEndSlot` prop
  - Persists setting via `api.settings.update()`
  - Controls whether orphaned glyphs (not used by any grapheme) are automatically managed
- **Delete Control**: A small trash `IconButton` is now present at the top-right of each glyph card (both detailed and compact renderers). Clicking it opens a confirmation modal ("Are you sure you would like to delete this glyph?") matching the grapheme-gallery flow. This modal performs the deletion via `api.glyph.delete()` and closes the modal on success.


#### GraphemeGallery

The grapheme gallery (`src/components/tabs/grapheme/galleryGrapheme/graphemeGallery.tsx`) provides:

- **Search & Filter**: Search graphemes by name, pronunciation, or glyph name
- **Sorting**: Sort by name or glyph count
- **Pagination**: Configurable results per page
- **Keyboard Navigation**: Roving tabindex with arrow key support
- **Auto-manage Toggle**: (See Glyph gallery) for glyph cleanup behavior
- **Delete Control**: A small trash `IconButton` is now present at the top-right of each grapheme card (both detailed and compact renderers). Clicking it opens a confirmation modal ("Are you sure you would like to delete this grapheme?") matching the glyph-gallery flow. This modal performs the deletion via `api.grapheme.delete()` and closes the modal on success.


#### LexiconGallery

The lexicon gallery (`src/components/tabs/lexicon/galleryLexicon/LexiconGallery.tsx`) provides:

- **Search & Filter**: Search words by lemma, pronunciation, or meaning
- **Sorting**: Sort by lemma (A-Z, Z-A), descendant count (most/fewest), or created date (newest/oldest)
- **Native Filter**: Filter by native words only, external words only, or all
- **Pagination**: Configurable results per page (12, 24, 48, 96)
- **Keyboard Navigation**: Roving tabindex with arrow key support
- **Delete Control**: Delete button on each card with protection warning for words that have descendants
- **Empty State**: Shows "Create first word" button when no entries exist


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

## Application Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                  App.tsx                                     │
│                           (EtymologProvider)                                │
│                                    │                                         │
│                          RouterTabContainer                                  │
│                    ┌───────────────┼───────────────┐                        │
│                    │               │               │                        │
│               ┌────▼────┐   ┌──────▼──────┐  ┌─────▼─────┐                  │
│               │ Lexicon │   │Script Maker │  │Graphotactic│                  │
│               │  /lexicon │  │/script-maker│  │    (WIP)  │                  │
│               └─────────┘   └──────┬──────┘  └───────────┘                  │
│                                    │                                         │
│                          ┌─────────┴─────────┐                              │
│                          │                   │                              │
│                    ┌─────▼─────┐       ┌─────▼─────┐                        │
│                    │ Graphemes │       │  Glyphs   │                        │
│                    │  (default)│       │ /glyphs   │                        │
│                    └───────────┘       └───────────┘                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Tab Sections

| Tab | Path | Description | Status |
|-----|------|-------------|--------|
| Lexicon | `/lexicon` | Word/vocabulary management | ✅ Complete |
| Part of Speech | `/part-of-speech` | Grammar categories | 🚧 Placeholder |
| Script Maker | `/script-maker` | Grapheme & glyph management | ✅ Complete |
| Graphotactic | `/graphotactic` | Writing system rules | 🚧 Placeholder |

---

## Route Structure

### Complete Route Map

```
/
├── /lexicon                        → LexiconMain
│   ├── (index)                     → LexiconHome (gallery + search/filter)
│   ├── /create                     → CreateLexiconPage (create form)
│   └── /db/:id                     → LexiconViewPage (view/edit + etymology tree)
│
├── /part-of-speech                 → Placeholder
│
├── /script-maker                   → GraphemeMain (RouterTabContainer)
│   ├── (index: Graphemes Tab)      
│   │   ├── (index)                 → GraphemeHome (gallery + nav)
│   │   ├── /create                 → CreateGraphemePage
│   │   ├── /chart                  → IPAChartPage (IPA chart viewer)
│   │   ├── /punctuation            → PunctuationPage (punctuation settings)
│   │   └── /grapheme/db/:id        → GraphemeEditPage
│   │
│   └── /glyphs (Glyphs Tab)
│       ├── (index)                 → GlyphsTab (gallery + nav)
│       ├── /create                 → NewGlyphPage
│       └── /db/:id                 → GlyphEditPage
│
└── /graphotactic                   → GraphotacticMain (placeholder)
```

### Route Details

| Route | Component | Description |
|-------|-----------|-------------|
| `/lexicon` | `LexiconHome` | Lexicon gallery with search/filter/sort |
| `/lexicon/create` | `CreateLexiconPage` | Create new word with spelling and ancestry |
| `/lexicon/db/:id` | `LexiconViewPage` | View/edit word + etymology tree |
| `/script-maker` | `GraphemeHome` | Grapheme gallery with search/sort/pagination |
| `/script-maker/create` | `CreateGraphemePage` | Create new grapheme with glyph selection |
| `/script-maker/chart` | `IPAChartPage` | Interactive IPA consonant & vowel charts |
| `/script-maker/punctuation` | `PunctuationPage` | Configure punctuation marks and separators |
| `/script-maker/grapheme/db/:id` | `GraphemeEditPage` | Edit existing grapheme |
| `/script-maker/glyphs` | `GlyphsTab` | Glyph gallery with search/sort/pagination |
| `/script-maker/glyphs/create` | `NewGlyphPage` | Create new glyph (standalone page) |
| `/script-maker/glyphs/db/:id` | `GlyphEditPage` | Edit existing glyph |

---

## Component Architecture

### Component Hierarchy

```
App.tsx
└── EtymologProvider (Context)
    └── RouterTabContainer (cyber-components)
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
        │   └── LexiconViewPage
        │       ├── DetailedLexiconDisplay
        │       ├── EtymologyTree
        │       │   └── EtymologyTreeNode (recursive)
        │       └── SmartForm (edit mode)
        │           └── LexiconFormFields
        │
        └── GraphemeMain (/script-maker)
            └── RouterTabContainer (nested tabs)
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
                │   │   ├── IPAConsonantChart
                │   │   │   └── IPAChartCell (×N)
                │   │   │       └── GlyphSpellingDisplay (if assigned)
                │   │   └── IPAVowelChart
                │   │       └── IPAChartCell (×N)
                │   │           └── GlyphSpellingDisplay (if assigned)
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
| **Tab Containers** | `GraphemeMain`, `LexiconMain`, `GraphotacticMain` | `src/components/tabs/*/main.tsx` |
| **Galleries** | `GraphemeView`, `GlyphGallery`, `LexiconGallery` | `src/components/tabs/*/gallery*/` |
| **Create Pages** | `CreateGraphemePage`, `NewGlyphPage`, `CreateLexiconPage` | `src/components/tabs/*/create*/` or `new*/` |
| **Edit/View Pages** | `GraphemeEditPage`, `GlyphEditPage`, `LexiconViewPage` | `src/components/tabs/*/edit*/` or `view*/` |
| **IPA Chart** | `IPAChartPage`, `IPAConsonantChart`, `IPAVowelChart`, `IPAChartCell` | `src/components/tabs/grapheme/ipaChart/`, `src/components/display/ipaChart/` |
| **Form Components** | `GlyphFormFields`, `GraphemeFormFields`, `LexiconFormFields` | `src/components/form/*/` |
| **Display Components** | `GlyphCard`, `CompactGraphemeDisplay`, `DetailedGraphemeDisplay`, `CompactLexiconDisplay`, `DetailedLexiconDisplay`, `EtymologyTree`, `GlyphSpellingDisplay` | `src/components/display/*/` |
| **Custom Inputs** | `PronunciationTableInput`, `SpellingInput`, `AncestryInput` | `src/components/form/customInput/*/` |
| **Modal Components** | `NewGlyphModal`, `EditGlyphModal` | Various locations |

### Gallery Features

#### GlyphGallery

The glyph gallery (`src/components/tabs/grapheme/galleryGlyphs/galleryGlyphs.tsx`) provides:

- **Search & Filter**: Search glyphs by name
- **Sorting**: Sort by name (A-Z, Z-A) or usage count (most/least used)
- **Pagination**: Configurable results per page (12, 24, 48, 96)
- **Keyboard Navigation**: Roving tabindex with arrow key support
- **Auto-manage Toggle**: A `CyberSwitch` in the toolbar allows toggling the `autoManageGlyphs` setting
  - Located in the toolbar's end slot via `toolbarEndSlot` prop
  - Persists setting via `api.settings.update()`
  - Controls whether orphaned glyphs (not used by any grapheme) are automatically managed
- **Delete Control**: A small trash `IconButton` is now present at the top-right of each glyph card (both detailed and compact renderers). Clicking it opens a confirmation modal ("Are you sure you would like to delete this glyph?") matching the grapheme-gallery flow. This modal performs the deletion via `api.glyph.delete()` and closes the modal on success.


#### GraphemeGallery

The grapheme gallery (`src/components/tabs/grapheme/galleryGrapheme/graphemeGallery.tsx`) provides:

- **Search & Filter**: Search graphemes by name, pronunciation, or glyph name
- **Sorting**: Sort by name or glyph count
- **Pagination**: Configurable results per page
- **Keyboard Navigation**: Roving tabindex with arrow key support
- **Auto-manage Toggle**: (See Glyph gallery) for glyph cleanup behavior
- **Delete Control**: A small trash `IconButton` is now present at the top-right of each grapheme card (both detailed and compact renderers). Clicking it opens a confirmation modal ("Are you sure you would like to delete this grapheme?") matching the glyph-gallery flow. This modal performs the deletion via `api.grapheme.delete()` and closes the modal on success.


#### LexiconGallery

The lexicon gallery (`src/components/tabs/lexicon/galleryLexicon/LexiconGallery.tsx`) provides:

- **Search & Filter**: Search words by lemma, pronunciation, or meaning
- **Sorting**: Sort by lemma (A-Z, Z-A), descendant count (most/fewest), or created date (newest/oldest)
- **Native Filter**: Filter by native words only, external words only, or all
- **Pagination**: Configurable results per page (12, 24, 48, 96)
- **Keyboard Navigation**: Roving tabindex with arrow key support
- **Delete Control**: Delete button on each card with protection warning for words that have descendants
- **Empty State**: Shows "Create first word" button when no entries exist


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

## Application Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                  App.tsx                                     │
│                           (EtymologProvider)                                │
│                                    │                                         │
│                          RouterTabContainer                                  │
│                    ┌───────────────┼───────────────┐                        │
│                    │               │               │                        │
│               ┌────▼────┐   ┌──────▼──────┐  ┌─────▼─────┐                  │
│               │ Lexicon │   │Script Maker │  │Graphotactic│                  │
│               │  /lexicon │  │/script-maker│  │    (WIP)  │                  │
│               └─────────┘   └──────┬──────┘  └───────────┘                  │
│                                    │                                         │
│                          ┌─────────┴─────────┐                              │
│                          │                   │                              │
│                    ┌─────▼─────┐       ┌─────▼─────┐                        │
│                    │ Graphemes │       │  Glyphs   │                        │
│                    │  (default)│       │ /glyphs   │                        │
│                    └───────────┘       └───────────┘                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Tab Sections

| Tab | Path | Description | Status |
|-----|------|-------------|--------|
| Lexicon | `/lexicon` | Word/vocabulary management | ✅ Complete |
| Part of Speech | `/part-of-speech` | Grammar categories | 🚧 Placeholder |
| Script Maker | `/script-maker` | Grapheme & glyph management | ✅ Complete |
| Graphotactic | `/graphotactic` | Writing system rules | 🚧 Placeholder |

---

## Route Structure

### Complete Route Map

```
/
├── /lexicon                        → LexiconMain
│   ├── (index)                     → LexiconHome (gallery + search/filter)
│   ├── /create                     → CreateLexiconPage (create form)
│   └── /db/:id                     → LexiconViewPage (view/edit + etymology tree)
│
├── /part-of-speech                 → Placeholder
│
├── /script-maker                   → GraphemeMain (RouterTabContainer)
│   ├── (index: Graphemes Tab)      
│   │   ├── (index)                 → GraphemeHome (gallery + nav)
│   │   ├── /create                 → CreateGraphemePage
│   │   ├── /chart                  → IPAChartPage (IPA chart viewer)
│   │   ├── /punctuation            → PunctuationPage (punctuation settings)
│   │   └── /grapheme/db/:id        → GraphemeEditPage
│   │
│   └── /glyphs (Glyphs Tab)
│       ├── (index)                 → GlyphsTab (gallery + nav)
│       ├── /create                 → NewGlyphPage
│       └── /db/:id                 → GlyphEditPage
│
└── /graphotactic                   → GraphotacticMain (placeholder)
```

### Route Details

| Route | Component | Description |
|-------|-----------|-------------|
| `/lexicon` | `LexiconHome` | Lexicon gallery with search/filter/sort |
| `/lexicon/create` | `CreateLexiconPage` | Create new word with spelling and ancestry |
| `/lexicon/db/:id` | `LexiconViewPage` | View/edit word + etymology tree |
| `/script-maker` | `GraphemeHome` | Grapheme gallery with search/sort/pagination |
| `/script-maker/create` | `CreateGraphemePage` | Create new grapheme with glyph selection |
| `/script-maker/chart` | `IPAChartPage` | Interactive IPA consonant & vowel charts |
| `/script-maker/punctuation` | `PunctuationPage` | Configure punctuation marks and separators |
| `/script-maker/grapheme/db/:id` | `GraphemeEditPage` | Edit existing grapheme |
| `/script-maker/glyphs` | `GlyphsTab` | Glyph gallery with search/sort/pagination |
| `/script-maker/glyphs/create` | `NewGlyphPage` | Create new glyph (standalone page) |
| `/script-maker/glyphs/db/:id` | `GlyphEditPage` | Edit existing glyph |

---

## Component Architecture

### Component Hierarchy

```
App.tsx
└── EtymologProvider (Context)
    └── RouterTabContainer (cyber-components)
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
        │   └── LexiconViewPage
        │       ├── DetailedLexiconDisplay
        │       ├── EtymologyTree
        │       │   └── EtymologyTreeNode (recursive)
        │       └── SmartForm (edit mode)
        │           └── LexiconFormFields
        │
        └── GraphemeMain (/script-maker)
            └── RouterTabContainer (nested tabs)
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
                │   │   ├── IPAConsonantChart
                │   │   │   └── IPAChartCell (×N)
                │   │   │       └── GlyphSpellingDisplay (if assigned)
                │   │   └── IPAVowelChart
                │   │       └── IPAChartCell (×N)
                │   │           └── GlyphSpellingDisplay (if assigned)
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
| **Tab Containers** | `GraphemeMain`, `LexiconMain`, `GraphotacticMain` | `src/components/tabs/*/main.tsx` |
| **Galleries** | `GraphemeView`, `GlyphGallery`, `LexiconGallery` | `src/components/tabs/*/gallery*/` |
| **Create Pages** | `CreateGraphemePage`, `NewGlyphPage`, `CreateLexiconPage` | `src/components/tabs/*/create*/` or `new*/` |
| **Edit/View Pages** | `GraphemeEditPage`, `GlyphEditPage`, `LexiconViewPage` | `src/components/tabs/*/edit*/` or `view*/` |
| **IPA Chart** | `IPAChartPage`, `IPAConsonantChart`, `IPAVowelChart`, `IPAChartCell` | `src/components/tabs/grapheme/ipaChart/`, `src/components/display/ipaChart/` |
| **Form Components** | `GlyphFormFields`, `GraphemeFormFields`, `LexiconFormFields` | `src/components/form/*/` |
| **Display Components** | `GlyphCard`, `CompactGraphemeDisplay`, `DetailedGraphemeDisplay`, `CompactLexiconDisplay`, `DetailedLexiconDisplay`, `EtymologyTree`, `GlyphSpellingDisplay` | `src/components/display/*/` |
| **Custom Inputs** | `PronunciationTableInput`, `SpellingInput`, `AncestryInput` | `src/components/form/customInput/*/` |
| **Modal Components** | `NewGlyphModal`, `EditGlyphModal` | Various locations |

### Gallery Features

#### GlyphGallery

The glyph gallery (`src/components/tabs/grapheme/galleryGlyphs/galleryGlyphs.tsx`) provides:

- **Search & Filter**: Search glyphs by name
- **Sorting**: Sort by name (A-Z, Z-A) or usage count (most/least used)
- **Pagination**: Configurable results per page (12, 24, 48, 96)
- **Keyboard Navigation**: Roving tabindex with arrow key support
- **Auto-manage Toggle**: A `CyberSwitch` in the toolbar allows toggling the `autoManageGlyphs` setting
  - Located in the toolbar's end slot via `toolbarEndSlot` prop
  - Persists setting via `api.settings.update()`
  - Controls whether orphaned glyphs (not used by any grapheme) are automatically managed
- **Delete Control**: A small trash `IconButton` is now present at the top-right of each glyph card (both detailed and compact renderers). Clicking it opens a confirmation modal ("Are you sure you would like to delete this glyph?") matching the grapheme-gallery flow. This modal performs the deletion via `api.glyph.delete()` and closes the modal on success.


#### GraphemeGallery

The grapheme gallery (`src/components/tabs/grapheme/galleryGrapheme/graphemeGallery.tsx`) provides:

- **Search & Filter**: Search graphemes by name, pronunciation, or glyph name
- **Sorting**: Sort by name or glyph count
- **Pagination**: Configurable results per page
- **Keyboard Navigation**: Roving tabindex with arrow key support
- **Auto-manage Toggle**: (See Glyph gallery) for glyph cleanup behavior
- **Delete Control**: A small trash `IconButton` is now present at the top-right of each grapheme card (both detailed and compact renderers). Clicking it opens a confirmation modal ("Are you sure you would like to delete this grapheme?") matching the glyph-gallery flow. This modal performs the deletion via `api.grapheme.delete()` and closes the modal on success.


#### LexiconGallery

The lexicon gallery (`src/components/tabs/lexicon/galleryLexicon/LexiconGallery.tsx`) provides:

- **Search & Filter**: Search words by lemma, pronunciation, or meaning
- **Sorting**: Sort by lemma (A-Z, Z-A), descendant count (most/fewest), or created date (newest/oldest)
- **Native Filter**: Filter by native words only, external words only, or all
- **Pagination**: Configurable results per page (12, 24, 48, 96)
- **Keyboard Navigation**: Roving tabindex with arrow key support
- **Delete Control**: Delete button on each card with protection warning for words that have descendants
- **Empty State**: Shows "Create first word" button when no entries exist


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

## Application Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                  App.tsx                                     │
│                           (EtymologProvider)                                │
│                                    │                                         │
│                          RouterTabContainer                                  │
│                    ┌───────────────┼───────────────┐                        │
│                    │               │               │                        │
│               ┌────▼────┐   ┌──────▼──────┐  ┌─────▼─────┐                  │
│               │ Lexicon │   │Script Maker │  │Graphotactic│                  │
│               │  /lexicon │  │/script-maker│  │    (WIP)  │                  │
│               └─────────┘   └──────┬──────┘  └───────────┘                  │
│                                    │                                         │
│                          ┌─────────┴─────────┐                              │
│                          │                   │                              │
│                    ┌─────▼─────┐       ┌─────▼─────┐                        │
│                    │ Graphemes │       │  Glyphs   │                        │
│                    │  (default)│       │ /glyphs   │                        │
│                    └───────────┘       └───────────┘                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Tab Sections

| Tab | Path | Description | Status |
|-----|------|-------------|--------|
| Lexicon | `/lexicon` | Word/vocabulary management | ✅ Complete |
| Part of Speech | `/part-of-speech` | Grammar categories | 🚧 Placeholder |
| Script Maker | `/script-maker` | Grapheme & glyph management | ✅ Complete |
| Graphotactic | `/graphotactic` | Writing system rules | 🚧 Placeholder |

---

## Route Structure

### Complete Route Map

```
/
├── /lexicon                        → LexiconMain
│   ├── (index)                     → LexiconHome (gallery + search/filter)
│   ├── /create                     → CreateLexiconPage (create form)
│   └── /db/:id                     → LexiconViewPage (view/edit + etymology tree)
│
├── /part-of-speech                 → Placeholder
│
├── /script-maker                   → GraphemeMain (RouterTabContainer)
│   ├── (index: Graphemes Tab)      
│   │   ├── (index)                 → GraphemeHome (gallery + nav)
│   │   ├── /create                 → CreateGraphemePage
│   │   ├── /chart                  → IPAChartPage (IPA chart viewer)
│   │   ├── /punctuation            → PunctuationPage (punctuation settings)
│   │   └── /grapheme/db/:id        → GraphemeEditPage
│   │
│   └── /glyphs (Glyphs Tab)
│       ├── (index)                 → GlyphsTab (gallery + nav)
│       ├── /create                 → NewGlyphPage
│       └── /db/:id                 → GlyphEditPage
│
└── /graphotactic                   → GraphotacticMain (placeholder)
```

### Route Details

| Route | Component | Description |
|-------|-----------|-------------|
| `/lexicon` | `LexiconHome` | Lexicon gallery with search/filter/sort |
| `/lexicon/create` | `CreateLexiconPage` | Create new word with spelling and ancestry |
| `/lexicon/db/:id` | `LexiconViewPage` | View/edit word + etymology tree |
| `/script-maker` | `GraphemeHome` | Grapheme gallery with search/sort/pagination |
| `/script-maker/create` | `CreateGraphemePage` | Create new grapheme with glyph selection |
| `/script-maker/chart` | `IPAChartPage` | Interactive IPA consonant & vowel charts |
| `/script-maker/punctuation` | `PunctuationPage` | Configure punctuation marks and separators |
| `/script-maker/grapheme/db/:id` | `GraphemeEditPage` | Edit existing grapheme |
| `/script-maker/glyphs` | `GlyphsTab` | Glyph gallery with search/sort/pagination |
| `/script-maker/glyphs/create` | `NewGlyphPage` | Create new glyph (standalone page) |
| `/script-maker/glyphs/db/:id` | `GlyphEditPage` | Edit existing glyph |

---

## Component Architecture

### Component Hierarchy

```
App.tsx
└── EtymologProvider (Context)
    └── RouterTabContainer (cyber-components)
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
        │   └── LexiconViewPage
        │       ├── DetailedLexiconDisplay
        │       ├── EtymologyTree
        │       │   └── EtymologyTreeNode (recursive)
        │       └── SmartForm (edit mode)
        │           └── LexiconFormFields
        │
        └── GraphemeMain (/script-maker)
            └── RouterTabContainer (nested tabs)
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
                │   │   ├── IPAConsonantChart
                │   │   │   └── IPAChartCell (×N)
                │   │   │       └── GlyphSpellingDisplay (if assigned)
                │   │   └── IPAVowelChart
                │   │       └── IPAChartCell (×N)
                │   │           └── GlyphSpellingDisplay (if assigned)
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
| **Tab Containers** | `GraphemeMain`, `LexiconMain`, `GraphotacticMain` | `src/components/tabs/*/main.tsx` |
| **Galleries** | `GraphemeView`, `GlyphGallery`, `LexiconGallery` | `src/components/tabs/*/gallery*/` |
| **Create Pages** | `CreateGraphemePage`, `NewGlyphPage`, `CreateLexiconPage` | `src/components/tabs/*/create*/` or `new*/` |
| **Edit/View Pages** | `GraphemeEditPage`, `GlyphEditPage`, `LexiconViewPage` | `src/components/tabs/*/edit*/` or `view*/` |
| **IPA Chart** | `IPAChartPage`, `IPAConsonantChart`, `IPAVowelChart`, `IPAChartCell` | `src/components/tabs/grapheme/ipaChart/`, `src/components/display/ipaChart/` |
| **Form Components** | `GlyphFormFields`, `GraphemeFormFields`, `LexiconFormFields` | `src/components/form/*/` |
| **Display Components** | `GlyphCard`, `CompactGraphemeDisplay`, `DetailedGraphemeDisplay`, `CompactLexiconDisplay`, `DetailedLexiconDisplay`, `EtymologyTree`, `GlyphSpellingDisplay` | `src/components/display/*/` |
| **Custom Inputs** | `PronunciationTableInput`, `SpellingInput`, `AncestryInput` | `src/components/form/customInput/*/` |
| **Modal Components** | `NewGlyphModal`, `EditGlyphModal` | Various locations |

### Gallery Features

#### GlyphGallery

The glyph gallery (`src/components/tabs/grapheme/galleryGlyphs/galleryGlyphs.tsx`) provides:

- **Search & Filter**: Search glyphs by name
- **Sorting**: Sort by name (A-Z, Z-A) or usage count (most/least used)
- **Pagination**: Configurable results per page (12, 24, 48, 96)
- **Keyboard Navigation**: Roving tabindex with arrow key support
- **Auto-manage Toggle**: A `CyberSwitch` in the toolbar allows toggling the `autoManageGlyphs` setting
  - Located in the toolbar's end slot via `toolbarEndSlot` prop
  - Persists setting via `api.settings.update()`
  - Controls whether orphaned glyphs (not used by any grapheme) are automatically managed
- **Delete Control**: A small trash `IconButton` is now present at the top-right of each glyph card (both detailed and compact renderers). Clicking it opens a confirmation modal ("Are you sure you would like to delete this glyph?") matching the grapheme-gallery flow. This modal performs the deletion via `api.glyph.delete()` and closes the modal on success.


#### GraphemeGallery

The grapheme gallery (`src/components/tabs/grapheme/galleryGrapheme/graphemeGallery.tsx`) provides:

- **Search & Filter**: Search graphemes by name, pronunciation, or glyph name
- **Sorting**: Sort by name or glyph count
- **Pagination**: Configurable results per page
- **Keyboard Navigation**: Roving tabindex with arrow key support
- **Auto-manage Toggle**: (See Glyph gallery) for glyph cleanup behavior
- **Delete Control**: A small trash `IconButton` is now present at the top-right of each grapheme card (both detailed and compact renderers). Clicking it opens a confirmation modal ("Are you sure you would like to delete this grapheme?") matching the glyph-gallery flow. This modal performs the deletion via `api.grapheme.delete()` and closes the modal on success.


#### LexiconGallery

The lexicon gallery (`src/components/tabs/lexicon/galleryLexicon/LexiconGallery.tsx`) provides:

- **Search & Filter**: Search words by lemma, pronunciation, or meaning
- **Sorting**: Sort by lemma (A-Z, Z-A), descendant count (most/fewest), or created date (newest/oldest)
- **Native Filter**: Filter by native words only, external words only, or all
- **Pagination**: Configurable results per page (12, 24, 48, 96)
- **Keyboard Navigation**: Roving tabindex with arrow key support
- **Delete Control**: Delete button on each card with protection warning for words that have descendants
- **Empty State**: Shows "Create first word" button when no entries exist


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

## Application Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                  App.tsx                                     │
│                           (EtymologProvider)                                │
│                                    │                                         │
│                          RouterTabContainer                                  │
│                    ┌───────────────┼───────────────┐                        │
│                    │               │               │                        │
│               ┌────▼────┐   ┌──────▼──────┐  ┌─────▼─────┐                  │
│               │ Lexicon │   │Script Maker │  │Graphotactic│                  │
│               │  /lexicon │  │/script-maker│  │    (WIP)  │                  │
│               └─────────┘   └──────┬──────┘  └───────────┘                  │
│                                    │                                         │
│                          ┌─────────┴─────────┐                              │
│                          │                   │                              │
│                    ┌─────▼─────┐       ┌─────▼─────┐                        │
│                    │ Graphemes │       │  Glyphs   │                        │
│                    │  (default)│       │ /glyphs   │                        │
│                    └───────────┘       └───────────┘                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Tab Sections

| Tab | Path | Description | Status |
|-----|------|-------------|--------|
| Lexicon | `/lexicon` | Word/vocabulary management | ✅ Complete |
| Part of Speech | `/part-of-speech` | Grammar categories | 🚧 Placeholder |
| Script Maker | `/script-maker` | Grapheme & glyph management | ✅ Complete |
| Graphotactic | `/graphotactic` | Writing system rules | 🚧 Placeholder |

---

## Route Structure

### Complete Route Map

```
/
├── /lexicon                        → LexiconMain
│   ├── (index)                     → LexiconHome (gallery + search/filter)
│   ├── /create                     → CreateLexiconPage (create form)
│   └── /db/:id                     → LexiconViewPage (view/edit + etymology tree)
│
├── /part-of-speech                 → Placeholder
│
├── /script-maker                   → GraphemeMain (RouterTabContainer)
│   ├── (index: Graphemes Tab)      
│   │   ├── (index)                 → GraphemeHome (gallery + nav)
│   │   ├── /create                 → CreateGraphemePage
│   │   ├── /chart                  → IPAChartPage (IPA chart viewer)
│   │   ├── /punctuation            → PunctuationPage (punctuation settings)
│   │   └── /grapheme/db/:id        → GraphemeEditPage
│   │
│   └── /glyphs (Glyphs Tab)
│       ├── (index)                 → GlyphsTab (gallery + nav)
│       ├── /create                 → NewGlyphPage
│       └── /db/:id                 → GlyphEditPage
│
└── /graphotactic                   → GraphotacticMain (placeholder)
```

### Route Details

| Route | Component | Description |
|-------|-----------|-------------|
| `/lexicon` | `LexiconHome` | Lexicon gallery with search/filter/sort |
| `/lexicon/create` | `CreateLexiconPage` | Create new word with spelling and ancestry |
| `/lexicon/db/:id` | `LexiconViewPage` | View/edit word + etymology tree |
| `/script-maker` | `GraphemeHome` | Grapheme gallery with search/sort/pagination |
| `/script-maker/create` | `CreateGraphemePage` | Create new grapheme with glyph selection |
| `/script-maker/chart` | `IPAChartPage` | Interactive IPA consonant & vowel charts |
| `/script-maker/punctuation` | `PunctuationPage` | Configure punctuation marks and separators |
| `/script-maker/grapheme/db/:id` | `GraphemeEditPage` | Edit existing grapheme |
| `/script-maker/glyphs` | `GlyphsTab` | Glyph gallery with search/sort/pagination |
| `/script-maker/glyphs/create` | `NewGlyphPage` | Create new glyph (standalone page) |
| `/script-maker/glyphs/db/:id` | `GlyphEditPage` | Edit existing glyph |

---

## Component Architecture

### Component Hierarchy

```
App.tsx
└── EtymologProvider (Context)
    └── RouterTabContainer (cyber-components)
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
        │   └── LexiconViewPage
        │       ├── DetailedLexiconDisplay
        │       ├── EtymologyTree
        │       │   └── EtymologyTreeNode (recursive)
        │       └── SmartForm (edit mode)
        │           └── LexiconFormFields
        │
        └── GraphemeMain (/script-maker)
            └── RouterTabContainer (nested tabs)
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
                │   │   ├── IPAConsonantChart
                │   │   │   └── IPAChartCell (×N)
                │   │   │       └── GlyphSpellingDisplay (if assigned)
                │   │   └── IPAVowelChart
                │   │       └── IPAChartCell (×N)
                │   │           └── GlyphSpellingDisplay (if assigned)
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
| **Tab Containers** | `GraphemeMain`, `LexiconMain`, `GraphotacticMain` | `src/components/tabs/*/main.tsx` |
| **Galleries** | `GraphemeView`, `GlyphGallery`, `LexiconGallery` | `src/components/tabs/*/gallery*/` |
| **Create Pages** | `CreateGraphemePage`, `NewGlyphPage`, `CreateLexiconPage` | `src/components/tabs/*/create*/` or `new*/` |
| **Edit/View Pages** | `GraphemeEditPage`, `GlyphEditPage`, `LexiconViewPage` | `src/components/tabs/*/edit*/` or `view*/` |
| **IPA Chart** | `IPAChartPage`, `IPAConsonantChart`, `IPAVowelChart`, `IPAChartCell` | `src/components/tabs/grapheme/ipaChart/`, `src/components/display/ipaChart/` |
| **Form Components** | `GlyphFormFields`, `GraphemeFormFields`, `LexiconFormFields` | `src/components/form/*/` |
| **Display Components** | `GlyphCard`, `CompactGraphemeDisplay`, `DetailedGraphemeDisplay`, `CompactLexiconDisplay`, `DetailedLexiconDisplay`, `EtymologyTree`, `GlyphSpellingDisplay` | `src/components/display/*/` |
| **Custom Inputs** | `PronunciationTableInput`, `SpellingInput`, `AncestryInput` | `src/components/form/customInput/*/` |
| **Modal Components** | `NewGlyphModal`, `EditGlyphModal` | Various locations |

### Gallery Features

#### GlyphGallery

The glyph gallery (`src/components/tabs/grapheme/galleryGlyphs/galleryGlyphs.tsx`) provides:

- **Search & Filter**: Search glyphs by name
- **Sorting**: Sort by name (A-Z, Z-A) or usage count (most/least used)
- **Pagination**: Configurable results per page (12, 24, 48, 96)
- **Keyboard Navigation**: Roving tabindex with arrow key support
- **Auto-manage Toggle**: A `CyberSwitch` in the toolbar allows toggling the `autoManageGlyphs` setting
  - Located in the toolbar's end slot via `toolbarEndSlot` prop
  - Persists setting via `api.settings.update()`
  - Controls whether orphaned glyphs (not used by any grapheme) are automatically managed
- **Delete Control**: A small trash `IconButton` is now present at the top-right of each glyph card (both detailed and compact renderers). Clicking it opens a confirmation modal ("Are you sure you would like to delete this glyph?") matching the grapheme-gallery flow. This modal performs the deletion via `api.glyph.delete()` and closes the modal on success.


#### GraphemeGallery

The grapheme gallery (`src/components/tabs/grapheme/galleryGrapheme/graphemeGallery.tsx`) provides:

- **Search & Filter**: Search graphemes by name, pronunciation, or glyph name
- **Sorting**: Sort by name or glyph count
- **Pagination**: Configurable results per page
- **Keyboard Navigation**: Roving tabindex with arrow key support
- **Auto-manage Toggle**: (See Glyph gallery) for glyph cleanup behavior
- **Delete Control**: A small trash `IconButton` is now present at the top-right of each grapheme card (both detailed and compact renderers). Clicking it opens a confirmation modal ("Are you sure you would like to delete this grapheme?") matching the glyph-gallery flow. This modal performs the deletion via `api.grapheme.delete()` and closes the modal on success.


#### LexiconGallery

The lexicon gallery (`src/components/tabs/lexicon/galleryLexicon/LexiconGallery.tsx`) provides:

- **Search & Filter**: Search words by lemma, pronunciation, or meaning
- **Sorting**: Sort by lemma (A-Z, Z-A), descendant count (most/fewest), or created date (newest/oldest)
- **Native Filter**: Filter by native words only, external words only, or all
- **Pagination**: Configurable results per page (12, 24, 48, 96)
- **Keyboard Navigation**: Roving tabindex with arrow key support
- **Delete Control**: Delete button on each card with protection warning for words that have descendants
- **Empty State**: Shows "Create first word" button when no entries exist


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

## Application Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                  App.tsx                                     │
│                           (EtymologProvider)                                │
│                                    │                                         │
│                          RouterTabContainer                                  │
│                    ┌───────────────┼───────────────┐                        │
│                    │               │               │                        │
│               ┌────▼────┐   ┌──────▼──────┐  ┌─────▼─────┐                  │
│               │ Lexicon │   │Script Maker │  │Graphotactic│                  │
│               │  /lexicon │  │/script-maker│  │    (WIP)  │                  │
│               └─────────┘   └──────┬──────┘  └───────────┘                  │
│                                    │                                         │
│                          ┌─────────┴─────────┐                              │
│                          │                   │                              │
│                    ┌─────▼─────┐       ┌─────▼─────┐                        │
│                    │ Graphemes │       │  Glyphs   │                        │
│                    │  (default)│       │ /glyphs   │                        │
│                    └───────────┘       └───────────┘                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Tab Sections

| Tab | Path | Description | Status |
|-----|------|-------------|--------|
| Lexicon | `/lexicon` | Word/vocabulary management | ✅ Complete |
| Part of Speech | `/part-of-speech` | Grammar categories | 🚧 Placeholder |
| Script Maker | `/script-maker` | Grapheme & glyph management | ✅ Complete |
| Graphotactic | `/graphotactic` | Writing system rules | 🚧 Placeholder |

---

## Route Structure

### Complete Route Map

```
/
├── /lexicon                        → LexiconMain
│   ├── (index)                     → LexiconHome (gallery + search/filter)
│   ├── /create                     → CreateLexiconPage (create form)
│   └── /db/:id                     → LexiconViewPage (view/edit + etymology tree)
│
├── /part-of-speech                 → Placeholder
│
├── /script-maker                   → GraphemeMain (RouterTabContainer)
│   ├── (index: Graphemes Tab)      
│   │   ├── (index)                 → GraphemeHome (gallery + nav)
│   │   ├── /create                 → CreateGraphemePage
│   │   ├── /chart                  → IPAChartPage (IPA chart viewer)
│   │   ├── /punctuation            → PunctuationPage (punctuation settings)
│   │   └── /grapheme/db/:id        → GraphemeEditPage
│   │
│   └── /glyphs (Glyphs Tab)
│       ├── (index)                 → GlyphsTab (gallery + nav)
│       ├── /create                 → NewGlyphPage
│       └── /db/:id                 → GlyphEditPage
│
└── /graphotactic                   → GraphotacticMain (placeholder)
```

### Route Details

| Route | Component | Description |
|-------|-----------|-------------|
| `/lexicon` | `LexiconHome` | Lexicon gallery with search/filter/sort |
| `/lexicon/create` | `CreateLexiconPage` | Create new word with spelling and ancestry |
| `/lexicon/db/:id` | `LexiconViewPage` | View/edit word + etymology tree |
| `/script-maker` | `GraphemeHome` | Grapheme gallery with search/sort/pagination |
| `/script-maker/create` | `CreateGraphemePage` | Create new grapheme with glyph selection |
| `/script-maker/chart` | `IPAChartPage` | Interactive IPA consonant & vowel charts |
| `/script-maker/punctuation` | `PunctuationPage` | Configure punctuation marks and separators |
| `/script-maker/grapheme/db/:id` | `GraphemeEditPage` | Edit existing grapheme |
| `/script-maker/glyphs` | `GlyphsTab` | Glyph gallery with search/sort/pagination |
| `/script-maker/glyphs/create` | `NewGlyphPage` | Create new glyph (standalone page) |
| `/script-maker/glyphs/db/:id` | `GlyphEditPage` | Edit existing glyph |

---

## Component Architecture

### Component Hierarchy

```
App.tsx
└── EtymologProvider (Context)
    └── RouterTabContainer (cyber-components)
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
        │   └── LexiconViewPage
        │       ├── DetailedLexiconDisplay
        │       ├── EtymologyTree
        │       │   └── EtymologyTreeNode (recursive)
        │       └── SmartForm (edit mode)
        │           └── LexiconFormFields
        │
        └── GraphemeMain (/script-maker)
            └── RouterTabContainer (nested tabs)
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
                │   │   ├── IPAConsonantChart
                │   │   │   └── IPAChartCell (×N)
                │   │   │       └── GlyphSpellingDisplay (if assigned)
                │   │   └── IPAVowelChart
                │   │       └── IPAChartCell (×N)
                │   │           └── GlyphSpellingDisplay (if assigned)
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
| **Tab Containers** | `GraphemeMain`, `LexiconMain`, `GraphotacticMain` | `src/components/tabs/*/main.tsx` |
| **Galleries** | `GraphemeView`, `GlyphGallery`, `LexiconGallery` | `src/components/tabs/*/gallery*/` |
| **Create Pages** | `CreateGraphemePage`, `NewGlyphPage`, `CreateLexiconPage` | `src/components/tabs/*/create*/` or `new*/` |
| **Edit/View Pages** | `GraphemeEditPage`, `GlyphEditPage`, `LexiconViewPage` | `src/components/tabs/*/edit*/` or `view*/` |
| **IPA Chart** | `IPAChartPage`, `IPAConsonantChart`, `IPAVowelChart`, `IPAChartCell` | `src/components/tabs/grapheme/ipaChart/`, `src/components/display/ipaChart/` |
| **Form Components** | `GlyphFormFields`, `GraphemeFormFields`, `LexiconFormFields` | `src/components/form/*/` |
| **Display Components** | `GlyphCard`, `CompactGraphemeDisplay`, `DetailedGraphemeDisplay`, `CompactLexiconDisplay`, `DetailedLexiconDisplay`, `EtymologyTree`, `GlyphSpellingDisplay` | `src/components/display/*/` |
| **Custom Inputs** | `PronunciationTableInput`, `SpellingInput`, `AncestryInput` | `src/components/form/customInput/*/` |
| **Modal Components** | `NewGlyphModal`, `EditGlyphModal` | Various locations |

### Gallery Features

#### GlyphGallery

The glyph gallery (`src/components/tabs/grapheme/galleryGlyphs/galleryGlyphs.tsx`) provides:

- **Search & Filter**: Search glyphs by name
- **Sorting**: Sort by name (A-Z, Z-A) or usage count (most/least used)
- **Pagination**: Configurable results per page (12, 24, 48, 96)
- **Keyboard Navigation**: Roving tabindex with arrow key support
- **Auto-manage Toggle**: A `CyberSwitch` in the toolbar allows toggling the `autoManageGlyphs` setting
  - Located in the toolbar's end slot via `toolbarEndSlot` prop
  - Persists setting via `api.settings.update()`
  - Controls whether orphaned glyphs (not used by any grapheme) are automatically managed
- **Delete Control**: A small trash `IconButton` is now present at the top-right of each glyph card (both detailed and compact renderers). Clicking it opens a confirmation modal ("Are you sure you would like to delete this glyph?") matching the grapheme-gallery flow. This modal performs the deletion via `api.glyph.delete()` and closes the modal on success.


#### GraphemeGallery

The grapheme gallery (`src/components/tabs/grapheme/galleryGrapheme/graphemeGallery.tsx`) provides:

- **Search & Filter**: Search graphemes by name, pronunciation, or glyph name
- **Sorting**: Sort by name or glyph count
- **Pagination**: Configurable results per page
- **Keyboard Navigation**: Roving tabindex with arrow key support
- **Auto-manage Toggle**: (See Glyph gallery) for glyph cleanup behavior
- **Delete Control**: A small trash `IconButton` is now present at the top-right of each grapheme card (both detailed and compact renderers). Clicking it opens a confirmation modal ("Are you sure you would like to delete this grapheme?") matching the glyph-gallery flow. This modal performs the deletion via `api.grapheme.delete()` and closes the modal on success.


#### LexiconGallery

The lexicon gallery (`src/components/tabs/lexicon/galleryLexicon/LexiconGallery.tsx`) provides:

- **Search & Filter**: Search words by lemma, pronunciation, or meaning
- **Sorting**: Sort by lemma (A-Z, Z-A), descendant count (most/fewest), or created date (newest/oldest)
- **Native Filter**: Filter by native words only, external words only, or all
- **Pagination**: Configurable results per page (12, 24, 48, 96)
- **Keyboard Navigation**: Roving tabindex with arrow key support
- **Delete Control**: Delete button on each card with protection warning for words that have descendants
- **Empty State**: Shows "Create first word" button when no entries exist


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

## Testing

### Test Suite Overview

| File | Tests | Description |
|------|-------|-------------|
| `glyphService.test.ts` | ~50 | Glyph CRUD operations |
| `graphemeService.test.ts` | ~60 | Grapheme & phoneme operations |
| `edgeCases.test.ts` | ~30 | Integration & boundary cases |
| `glyphCanvasInput.test.ts` | 20 | GlyphCanvasInput strategies & layout utils |
| `autoSpellService.test.ts` | ~35 | Auto-spelling DP algorithm |

**Total: ~195 tests**

### Key Test Scenarios

- Glyph reusability across multiple graphemes
- Safe delete (preventing deletion of in-use glyphs)
- Force delete (removing glyph references)
- Cascade deletes (phonemes deleted with graphemes)
- Unicode/IPA support for phonemes
- Position ordering for glyphs in graphemes
- Auto-cleanup of orphaned glyphs when setting enabled
- Insertion strategies (append, prepend, cursor-based)
- Layout calculations (LTR, RTL, TTB, BTT)
- Concurrent operations

### Running Tests

```bash
# Run all tests
pnpm test

# Watch mode
pnpm test:watch

# With coverage
pnpm test --coverage
```

---

## Development

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Run tests
pnpm test

# Build for production
pnpm build
```

---

## Known Issues & Fixes

### Fixed: Nested Form Submission Bug (Jan 2026)

**Issue**: When creating a new glyph via the modal within the grapheme creation form, submitting the glyph form would also trigger the parent grapheme form to submit.

**Root Cause**: The `useSmartForm` hook's submit handler called `event.preventDefault()` but not `event.stopPropagation()`. While HTML form submit events don't bubble by default, React's synthetic event system can still propagate events through the component tree when forms are nested (even through portals).

**Fix**: Added `event.stopPropagation()` to the submit handler in `packages/smart-form/smartForm/useSmartForm.tsx`:

```tsx
const onSubmitFunc = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Stop propagation to prevent nested forms from triggering parent form submissions
    event.stopPropagation();
    // ... rest of handler
};
```

**Affected Components**:
- `NewGlyphModal` rendered inside `GraphemeFormFields`
- `EditGlyphModal` rendered inside `GraphemeFormFields`
- Any SmartForm nested within another SmartForm

### Database Migration Notes

- Current version: v3 (with category columns)
- Migration from v1/v2 currently triggers fresh database creation
- TODO: Implement data-preserving migrations

---

## Architecture Considerations & Optimization Opportunities

### Design Principles

The Etymolog application follows three core principles:

1. **Modularity**: Components are highly reusable. Forms use extracted field components (`GlyphFormFields`, `GraphemeFormFields`), galleries use shared `DataGallery` component, and all data access goes through a unified context API.

2. **Performance**: Implements memoization with `useMemo`/`useCallback`, virtualization for 100+ items in galleries, debounced search (300ms), and lazy loading of grapheme complete data.

3. **Functionality**: Comprehensive feature set covering glyph drawing, grapheme composition, phoneme management, auto-cleanup, search/filter/sort, and keyboard navigation.

### Current Architecture Strengths

✅ **Clean Separation**: Two-layer virtual frontend/backend pattern isolates UI from data logic
✅ **Type Safety**: Full TypeScript coverage with comprehensive type definitions
✅ **Testability**: 141 test cases with clear service boundaries
✅ **API Consistency**: Standardized `ApiResponse<T>` wrapper for all operations
✅ **Component Reusability**: `GlyphCard` supports 3 modes, form fields are extracted, galleries are unified
✅ **Accessibility**: ARIA attributes, keyboard navigation, semantic HTML

### Identified Optimization Opportunities

#### 1. Modal/Page Pattern Consolidation

**Current State**: Three patterns for glyph creation:
- Standalone page: `NewGlyphPage.tsx` (route-based)
- Modal wrapper: `NewGlyphModal.tsx` (in grapheme form)
- Edit modal: `EditGlyphModal.tsx` (in grapheme form)

**Recommendation**: Create a unified `GlyphModal` component:
```tsx
<GlyphModal
    mode="create" | "edit"
    glyphId={editMode ? id : undefined}
    renderTrigger={(open) => <Button onClick={open}>Create Glyph</Button>}
    onSuccess={(glyph) => handleSuccess(glyph)}
/>
```
**Impact**: Reduces 3-4 files to 1 component, eliminates duplication

#### 2. Settings Storage Migration

**Current State**: All settings stored in localStorage (`etymolog_settings_v1`)
**Issue**: Conlang-specific settings (like `autoManageGlyphs`) don't travel with exported database files

**Recommendation**: Migrate to hybrid storage:
- **localStorage**: Global UI preferences (`defaultGalleryView`, `autoSaveInterval`)
- **SQLite**: Conlang-specific settings (`autoManageGlyphs`, future: `scriptDirection`, `glyphSizePresets`)

**Implementation**:
```sql
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    type TEXT DEFAULT 'string'
);
```

**Impact**: Settings persist with conlang on export/import

#### 3. Lexicon Feature ✅ COMPLETE (Backend + Frontend)

**Implemented Features**:
- ✅ Lexicon entries with lemma, pronunciation, meaning, part_of_speech, notes
- ✅ Ordered grapheme spelling via `lexicon_spelling` junction table
- ✅ Etymology tracking via `lexicon_ancestry` self-referential junction table
- ✅ Auto-spelling from IPA pronunciation using grapheme phoneme mappings
- ✅ External/borrowed word support via `is_native` flag
- ✅ Recursive ancestry tree queries with cycle detection
- ✅ Bidirectional ancestry (ancestors + descendants)
- ✅ Full CRUD API with standardized `ApiResponse<T>` format

**UI Components (Implemented)**:
- ✅ `LexiconGallery` - searchable/sortable/filterable gallery with delete protection
- ✅ `CreateLexiconPage` - create form with SmartForm, SpellingInput, AncestryInput
- ✅ `LexiconViewPage` - view/edit page with delete functionality
- ✅ `EtymologyTree` - visual tree component for ancestry relationships
- ✅ `CompactLexiconDisplay` / `DetailedLexiconDisplay` - display cards
- ✅ `SpellingInput` - grapheme selector with auto-spell preview
- ✅ `AncestryInput` - ancestor selector with cycle detection

#### 4. Performance Optimizations

**Current**: Virtualization auto-enables at 100+ items
**Additional Optimizations**:
- Implement SVG sprite caching for frequently used glyphs
- Add `React.memo` to `GlyphCard` and `CompactGraphemeDisplay`
- Debounce grapheme preview updates (currently instant)
- Lazy-load phoneme data (fetch on grapheme expand)

#### 5. No Detected Duplicates

**Analysis**: The codebase follows the DRY principle well:
- Form fields are extracted and reused
- `GlyphCard` handles multiple modes via props
- Gallery logic is centralized in `DataGallery`
- Database services are single-purpose
- API layer wraps services consistently
- Lexicon follows same patterns as grapheme (junction tables with position)

**Conclusion**: No major duplication issues to address

### Future Enhancements

| Priority | Feature | Description |
|----------|---------|-------------|
| **High** | Settings migration to SQLite | Make conlang settings portable |
| **High** | Import/Export UI | Complete database backup/restore functionality |
| **Medium** | Graphotactic rules | Define valid grapheme sequences |
| **Medium** | Part of Speech table | Formal part_of_speech management with FK |
| **Medium** | Glyph transforms | Rotation, scaling in grapheme composition |
| **Low** | Collaborative editing | Future server migration support |

---

## Contributing

When adding new features, please:

1. Follow the two-layer architecture (UI components use `useEtymolog()`)
2. Add tests for new service methods
3. Use `GlyphFormFields`/`GraphemeFormFields`/`LexiconFormFields` for form consistency
4. Ensure buttons in forms have `type="button"` unless they're submit buttons
5. Update this README with route/component changes
6. Follow the junction table pattern for ordered relationships (see `grapheme_glyphs`, `lexicon_spelling`)

---

*Last updated: January 26, 2026*
