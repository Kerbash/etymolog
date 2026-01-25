# Etymolog

A conlang (constructed language) script creation and management tool. Create custom writing systems with glyphs, graphemes, and their associated phonemes (pronunciations).

## Features

- **Script Drawer**: Draw custom glyphs using pen, shapes, and selection tools
- **Glyph Library**: Reusable atomic visual symbols
- **Grapheme Composition**: Combine glyphs into meaningful written units
- **Phoneme Management**: Associate multiple pronunciations with each grapheme
- **Auto-Spelling Support**: Mark phonemes for use in automatic spelling/transliteration
- **Local Database**: All data stored locally using SQL.js (SQLite in the browser)
- **Import/Export**: Save and load your language data

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Use Cases & Requirements](#use-cases--requirements)
3. [Application Architecture](#application-architecture)
4. [Route Structure](#route-structure)
5. [Component Architecture](#component-architecture)
6. [Form Architecture](#form-architecture)
7. [Data Architecture](#data-architecture)
8. [Two-Layer Architecture](#two-layer-architecture)
9. [API Reference](#api-reference)
10. [SQL Structure](#sql-structure)
11. [File Structure](#file-structure)
12. [Testing](#testing)
13. [Development](#development)
14. [Known Issues & Fixes](#known-issues--fixes)

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

### Why Two Layers?

Even though this is a PWA running entirely client-side, we maintain clean separation of concerns:

- **Frontend (UI)**: React components only render and handle user input
- **Backend (API)**: Handles all data logic, validation, and persistence
- **Benefits**: Testability, maintainability, and potential future server migration

---

## Use Cases & Requirements

### Primary Use Cases

| Use Case | Description | Primary Route | Status |
|----------|-------------|---------------|--------|
| **UC1: Create Glyph** | Draw and save an atomic visual symbol | `/script-maker/glyphs/create` or modal in grapheme form | ✅ Complete |
| **UC2: Browse Glyphs** | View all saved glyphs in a searchable gallery with usage counts | `/script-maker/glyphs` | ✅ Complete |
| **UC3: Edit Glyph** | Modify an existing glyph's drawing, name, or metadata | `/script-maker/glyphs/db/:id` | ✅ Complete |
| **UC4: Delete Glyph** | Remove a glyph (with protection if in use, or force/cascade delete) | Gallery or edit page | ✅ Complete |
| **UC5: Create Grapheme** | Compose glyphs into a written character with pronunciations | `/script-maker/create` | ✅ Complete |
| **UC6: Browse Graphemes** | View all graphemes in a searchable gallery | `/script-maker` | ✅ Complete |
| **UC7: Edit Grapheme** | Modify grapheme composition, metadata, or pronunciations | `/script-maker/grapheme/db/:id` | ✅ Complete |
| **UC8: Delete Grapheme** | Remove a grapheme (cascades to phonemes) | Gallery or edit page | ✅ Complete |
| **UC9: Manage Pronunciations** | Add, edit, or remove phonemes for a grapheme | Within grapheme forms | ✅ Complete |
| **UC10: Import/Export** | Save/load the entire database as SQLite file | Future/settings | 🚧 Planned |
| **UC11: Auto-Manage Glyphs** | Automatically delete orphaned glyphs when no longer used | Settings toggle in glyph gallery | ✅ Complete |

### Secondary Use Cases

| Use Case | Description | Status |
|----------|-------------|--------|
| **UC12: Configure Settings** | Toggle autoManageGlyphs, set gallery view preferences | Toolbar toggle | ✅ Complete |
| **UC13: Lexicon Management** | Create and manage vocabulary entries | `/lexicon` | 🚧 Basic |
| **UC14: Graphotactic Rules** | Define valid grapheme sequences | `/graphotactic` | 🚧 Placeholder |
| **UC15: Search & Filter** | Search glyphs/graphemes by name, sort by various criteria | All galleries | ✅ Complete |

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
| Lexicon | `/lexicon` | Word/vocabulary management | 🚧 Basic |
| Part of Speech | `/part-of-speech` | Grammar categories | 🚧 Placeholder |
| Script Maker | `/script-maker` | Grapheme & glyph management | ✅ Complete |
| Graphotactic | `/graphotactic` | Writing system rules | 🚧 Placeholder |

---

## Route Structure

### Complete Route Map

```
/
├── /lexicon                        → LexiconMain
│   ├── (index)                     → LexiconHome
│   ├── /create                     → CreateLexiconForm
│   └── /view                       → LexiconView
│       └── /view/:id               → LexiconView (with selection)
│
├── /part-of-speech                 → Placeholder
│
├── /script-maker                   → GraphemeMain (RouterTabContainer)
│   ├── (index: Graphemes Tab)      
│   │   ├── (index)                 → GraphemeHome (gallery + nav)
│   │   ├── /create                 → CreateGraphemePage
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
| `/script-maker` | `GraphemeHome` | Grapheme gallery with search/sort/pagination |
| `/script-maker/create` | `CreateGraphemePage` | Create new grapheme with glyph selection |
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
        └── GraphemeMain (/script-maker)
            └── RouterTabContainer (nested tabs)
                ├── GraphemesTab
                │   ├── GraphemeHome
                │   │   ├── GraphemeNav
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
| **Galleries** | `GraphemeView`, `GlyphGallery` | `src/components/tabs/grapheme/gallery*/` |
| **Create Pages** | `CreateGraphemePage`, `NewGlyphPage` | `src/components/tabs/grapheme/new*/` |
| **Edit Pages** | `GraphemeEditPage`, `GlyphEditPage` | `src/components/tabs/grapheme/edit*/` |
| **Form Components** | `GlyphFormFields`, `GraphemeFormFields` | `src/components/form/*/` |
| **Display Components** | `GlyphCard`, `CompactGraphemeDisplay`, `DetailedGraphemeDisplay` | `src/components/display/*/` |
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

## Form Architecture

````### Form System Overview

The application uses a **modular form architecture** built on the `smart-form` package. Forms are composed of:

1. **Form Containers**: Wrap SmartForm with submit logic
2. **Form Fields Components**: Reusable field groups
3. **Modals**: Allow inline creation/editing

```
┌─────────────────────────────────────────────────────────────────┐
│                    FORM FIELD COMPONENTS                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  GlyphFormFields                 GraphemeFormFields             │
│  ├── SvgDrawerInput              ├── Glyph Selection Area       │
│  ├── LabelShiftTextInput (Name)  │   ├── GlyphCard (modal mode) │
│  ├── LabelShiftTextInput (Cat)   │   └── Add/Select buttons     │
│  └── LabelShiftTextInput (Notes) ├── LabelShiftTextInput (Name) │
│                                  ├── LabelShiftTextInput (Cat)  │
│                                  ├── LabelShiftTextInput (Notes)│
│                                  └── PronunciationTableInput    │
│                                      └── (uses internal SmartForm │
│                                          as="div" for rows)     │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
              ▼               ▼               ▼
┌─────────────────────┐ ┌─────────────────────┐ ┌─────────────────────┐
│      GlyphForm      │ │   NewGlyphModal     │ │   EditGlyphModal    │
│  (Standalone Form)  │ │   (Modal Wrapper)   │ │   (Modal Wrapper)   │
│  mode: create/edit  │ │   mode: "create"    │ │   mode: "edit"      │
│  ┌───────────────┐  │ │  ┌───────────────┐  │ │  ┌───────────────┐  │
│  │  SmartForm    │  │ │  │  Modal        │  │ │  │  Modal        │  │
│  │  └──Fields    │  │ │  │  └──GlyphForm │  │ │  │  └──GlyphForm │  │
│  └───────────────┘  │ │  └───────────────┘  │ │  └───────────────┘  │
└─────────────────────┘ └─────────────────────┘ └─────────────────────┘
              │                   │                       │
              │                   └───────────────────────┘
              │                             │
              │                   Used by GraphemeFormFields
              │                   for inline glyph management
              │
              ▼
┌──────────────────────────────────────────────────────────────────┐
│                      PAGE COMPONENTS                              │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  NewGlyphPage           GlyphEditPage          NewGraphemeForm   │
│  ├── Nav (back link)    ├── Nav (back link)    ├── SmartForm     │
│  └── GlyphForm          └── SmartForm          │   └── Fields    │
│      (mode: create)         (mode: edit)                         │
│                             + Delete button    GraphemeEditPage  │
│                                                ├── SmartForm     │
│                                                │   └── Fields    │
│                                                └── Submit/Delete │
└──────────────────────────────────────────────────────────────────┘
```

### Form Data Flow

```
User Input → SmartForm (validation) → Submit Handler → API Layer → Database
                                            │
                                            ▼
                                    Context auto-refresh
                                            │
                                            ▼
                                    UI updates reactively
```

### SmartForm Integration (CRITICAL)

The form components use the `smart-form` package for form state management. **Understanding the correct usage pattern is critical** to avoid stale state bugs.

**✅ CORRECT Pattern - Call registerField on every render:**
```tsx
function MyFormFields({ registerField }) {
    // Call registerField directly each render - SmartForm handles internal state
    const nameField = registerField("name", { validation: ... });
    const emailField = registerField("email", {});
    
    return (
        <>
            <LabelShiftTextInput {...nameField} displayName="Name" />
            <LabelShiftTextInput {...emailField} displayName="Email" />
        </>
    );
}
```

**❌ WRONG Pattern - DO NOT cache registerField results in refs:**
```tsx
function MyFormFields({ registerField }) {
    // WRONG! This causes stale state - fieldState values never update!
    const fieldsRef = useRef({});
    if (!fieldsRef.current.name) {
        fieldsRef.current.name = registerField("name", {});
    }
    
    // fieldsRef.current.name.fieldState contains STALE values!
    return <LabelShiftTextInput {...fieldsRef.current.name} />;
}
```

**Why this matters:**
- `registerField` is wrapped in `useCallback` with `fieldStates` as a dependency
- Each call returns **fresh** `fieldState` values from React state
- SmartForm handles registration internally via pending refs (won't re-register existing fields)
- Handlers are stable via internal caching
- The `fieldState.isEmpty.value`, `fieldState.warning.value`, etc. **must be read fresh** each render

### Glyph Form Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `GlyphFormFields` | `src/components/form/glyphForm/GlyphFormFields.tsx` | Reusable glyph fields (SVG, name, category, notes) |
| `GlyphForm` | `src/components/form/glyphForm/GlyphForm.tsx` | Standalone form wrapper with SmartForm + submit logic |
| `NewGlyphModal` | `src/components/tabs/grapheme/newGlyph/NewGlyphModal.tsx` | Modal for creating glyph inline |
| `EditGlyphModal` | `src/components/form/glyphForm/EditGlyphModal.tsx` | Modal for editing glyph inline |
| `NewGlyphPage` | `src/components/tabs/grapheme/newGlyph/NewGlyphPage.tsx` | Standalone page for glyph creation |
| `GlyphEditPage` | `src/components/tabs/grapheme/editGlyph/GlyphEditPage.tsx` | Standalone page for glyph editing |

### Grapheme Form Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `GraphemeFormFields` | `src/components/form/graphemeForm/GraphemeFormFields.tsx` | Reusable grapheme fields with glyph selection |
| `NewGraphemeForm` | `src/components/tabs/grapheme/newGrapheme/newGrapheme.tsx` | Create grapheme form with SmartForm |
| `GraphemeEditPage` | `src/components/tabs/grapheme/editGrapheme/GraphemeEditPage.tsx` | Edit grapheme page |

### Custom Inputs

| Component | Location | Purpose |
|-----------|----------|---------|
| `PronunciationTableInput` | `src/components/form/customInput/pronunciationTableInput/` | IPA pronunciation table with add/remove rows |

---

## Data Architecture

### Terminology

| UI Term | DB Term | Description |
|---------|---------|-------------|
| Glyph | Glyph | An atomic visual symbol (SVG drawing) - reusable |
| Grapheme | Grapheme | A composition of one or more glyphs - represents a written character |
| Pronunciation | Phoneme | A sound associated with a grapheme |
| Auto-Spelling | `use_in_auto_spelling` | Whether this phoneme is used for automatic transliteration |

### Data Model

```
┌─────────────────┐     ┌─────────────────────────┐     ┌─────────────────┐
│     glyphs      │     │   grapheme_glyphs       │     │   graphemes     │
├─────────────────┤     │   (junction table)      │     ├─────────────────┤
│ id              │◄────┤ glyph_id                │────►│ id              │
│ name            │     │ grapheme_id             │     │ name            │
│ svg_data        │     │ position (order)        │     │ category        │
│ category        │     │ transform               │     │ notes           │
│ notes           │     └─────────────────────────┘     │ created_at      │
│ created_at      │                                     │ updated_at      │
│ updated_at      │                                     └────────┬────────┘
└─────────────────┘                                              │
                                                                 │ 1:N
                                                                 ▼
                                                        ┌─────────────────┐
                                                        │    phonemes     │
                                                        ├─────────────────┤
                                                        │ id              │
                                                        │ grapheme_id     │
                                                        │ phoneme (IPA)   │
                                                        │ use_in_auto_... │
                                                        │ context         │
                                                        └─────────────────┘
```

### Why This Architecture?

1. **Glyph Reusability**: The same glyph can be used in multiple graphemes. For example, a diacritical mark glyph can be combined with different base glyphs.

2. **Compound Characters**: Graphemes can be composed of multiple glyphs in order. This enables ligatures, combined characters, and complex scripts.

3. **Future-Proof**: The `transform` field in the junction table allows for future features like glyph rotation, scaling, or positioning within a grapheme.

### Type Definitions

```typescript
// Core Types (src/db/types.ts)

interface Glyph {
    id: number;
    name: string;
    svg_data: string;
    category: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
}

interface Grapheme {
    id: number;
    name: string;
    category: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
}

interface Phoneme {
    id: number;
    grapheme_id: number;
    phoneme: string;
    use_in_auto_spelling: boolean;
    context: string | null;
}

// Composite Types
interface GraphemeComplete extends Grapheme {
    glyphs: Glyph[];      // Ordered by position
    phonemes: Phoneme[];
}

interface GlyphWithUsage extends Glyph {
    usageCount: number;   // Number of graphemes using this glyph
}
```

---

## Two-Layer Architecture

Etymolog uses a **virtual frontend/backend** architecture to separate UI concerns from data operations.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND LAYER                                  │
│  (React Components)                                                         │
│                                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│  │ GlyphGallery│  │GraphemeView │  │ NewGrapheme │  │ Settings    │       │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────────────┘       │
│         │                │                │                │               │
│         └────────────────┴────────────────┴────────────────┘               │
│                                   │                                         │
│                          useEtymolog() hook                                 │
│                                   │                                         │
├───────────────────────────────────┼─────────────────────────────────────────┤
│                              API LAYER                                      │
│  (EtymologContext / Virtual Backend)                                        │
│                                   │                                         │
│         ┌─────────────────────────┼─────────────────────────┐               │
│         │                         │                         │               │
│  ┌──────▼──────┐  ┌───────────────▼───────────────┐  ┌──────▼──────┐       │
│  │  glyphApi   │  │        graphemeApi            │  │ settingsApi │       │
│  │  - create   │  │  - create                     │  │ - get       │       │
│  │  - getAll   │  │  - getAllComplete             │  │ - update    │       │
│  │  - delete   │  │  - delete                     │  │ - reset     │       │
│  └──────┬──────┘  └───────────────┬───────────────┘  └─────────────┘       │
│         │                         │                                         │
├─────────┼─────────────────────────┼─────────────────────────────────────────┤
│         │        BACKEND LAYER    │                                         │
│         │    (Database Services)  │                                         │
│         │                         │                                         │
│  ┌──────▼──────┐  ┌───────────────▼───────────────┐                        │
│  │glyphService │  │       graphemeService         │                        │
│  └──────┬──────┘  └───────────────┬───────────────┘                        │
│         │                         │                                         │
│         └─────────────────────────┴─────────────────────────┐               │
│                                                             │               │
│                                   ┌─────────────────────────▼─────────────┐ │
│                                   │          SQL.js Database              │ │
│                                   │         (localStorage)                │ │
│                                   └───────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Layers Explained

1. **Frontend Layer** (React Components)
   - Purely concerned with UI rendering and user interaction
   - Accesses data and operations only through the `useEtymolog()` hook
   - No direct database imports or SQL knowledge

2. **API Layer** (EtymologContext)
   - Acts as a "virtual backend" providing standardized API responses
   - All operations return `ApiResponse<T>` with `{ success, data, error }`
   - Manages reactive state subscriptions for automatic UI updates
   - Handles settings (including `simpleScriptSystem` flag)

3. **Backend Layer** (Database Services)
   - Raw database operations (glyphService, graphemeService)
   - SQL.js database management
   - Persistence to localStorage

### Convenience Hooks

```tsx
// Main hook - full access
const { api, data, settings, isLoading, error, refresh } = useEtymolog();

// API only
const api = useEtymologApi();

// Data only (reactive)
const { glyphs, graphemesComplete, glyphCount } = useEtymologData();

// Settings with update function
const { settings, updateSettings } = useEtymologSettings();

// Loading status only
const { isLoading, isReady, error } = useEtymologStatus();
```

---

## API Reference

### API Response Format

All API operations return a standardized response:

```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: ApiErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}

type ApiErrorCode =
  | 'DB_NOT_INITIALIZED'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONSTRAINT_VIOLATION'
  | 'OPERATION_FAILED'
  | 'UNKNOWN_ERROR';
```

### Glyph API (`api.glyph`)

| Method | Description | Returns |
|--------|-------------|---------|
| `create(request)` | Create a new glyph | `ApiResponse<Glyph>` |
| `getById(id)` | Get a glyph by ID | `ApiResponse<Glyph>` |
| `getAll()` | Get all glyphs | `ApiResponse<GlyphListResponse>` |
| `getAllWithUsage()` | Get all glyphs with usage count | `ApiResponse<GlyphWithUsageListResponse>` |
| `search(query)` | Search glyphs by name | `ApiResponse<GlyphListResponse>` |
| `update(id, request)` | Update a glyph | `ApiResponse<Glyph>` |
| `delete(id)` | Delete a glyph (fails if in use) | `ApiResponse<void>` |
| `forceDelete(id)` | Delete a glyph, removing references | `ApiResponse<void>` |
| `cascadeDelete(id)` | Delete glyph and all graphemes using it | `ApiResponse<void>` |
| `checkNameExists(name, excludeId?)` | Check if name is taken | `ApiResponse<boolean>` |

### Grapheme API (`api.grapheme`)

| Method | Description | Returns |
|--------|-------------|---------|
| `create(request)` | Create a grapheme with glyphs and phonemes | `ApiResponse<GraphemeComplete>` |
| `getById(id)` | Get basic grapheme info | `ApiResponse<Grapheme>` |
| `getByIdComplete(id)` | Get grapheme with glyphs + phonemes | `ApiResponse<GraphemeComplete>` |
| `getAll()` | Get all graphemes (basic) | `ApiResponse<GraphemeListResponse>` |
| `getAllComplete()` | Get all graphemes with full data | `ApiResponse<GraphemeCompleteListResponse>` |
| `search(query)` | Search graphemes by name | `ApiResponse<GraphemeListResponse>` |
| `update(id, request)` | Update grapheme metadata | `ApiResponse<Grapheme>` |
| `updateGlyphs(id, request)` | Replace grapheme's glyph composition (triggers auto-cleanup if enabled) | `ApiResponse<void>` |
| `delete(id)` | Delete grapheme (cascades to phonemes, triggers auto-cleanup if enabled) | `ApiResponse<void>` |

**Auto-Cleanup Behavior**: When the `autoManageGlyphs` setting is enabled, `delete()` and `updateGlyphs()` automatically invoke `cleanupOrphanedGlyphs()` to remove glyphs with zero usage count.

### Phoneme API (`api.phoneme`)

| Method | Description | Returns |
|--------|-------------|---------|
| `add(request)` | Add a phoneme to a grapheme | `ApiResponse<Phoneme>` |
| `getById(id)` | Get a phoneme by ID | `ApiResponse<Phoneme>` |
| `getByGraphemeId(graphemeId)` | Get all phonemes for a grapheme | `ApiResponse<Phoneme[]>` |
| `update(id, request)` | Update a phoneme | `ApiResponse<Phoneme>` |
| `delete(id)` | Delete a phoneme | `ApiResponse<void>` |
| `deleteAllForGrapheme(graphemeId)` | Delete all phonemes for a grapheme | `ApiResponse<number>` |
| `getAutoSpelling()` | Get all phonemes marked for auto-spelling | `ApiResponse<Phoneme[]>` |

### Settings API (`api.settings`)

| Method | Description | Returns |
|--------|-------------|---------|
| `get()` | Get current settings | `ApiResponse<EtymologSettings>` |
| `update(settings)` | Update settings (partial) | `ApiResponse<EtymologSettings>` |
| `reset()` | Reset settings to defaults | `ApiResponse<EtymologSettings>` |

#### EtymologSettings Properties

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `simpleScriptSystem` | `boolean` | `false` | Reserved for future simplified mode |
| `defaultGalleryView` | `'compact' \| 'detailed' \| 'expanded'` | `'compact'` | Default view mode for galleries |
| `autoSaveInterval` | `number` | `0` | Auto-save interval in ms (0 = disabled) |
| `autoManageGlyphs` | `boolean` | `false` | Automatically manage orphaned glyphs |

**Note**: Settings are currently stored in localStorage. Future plans include storing conlang-specific settings (like `autoManageGlyphs`) in the SQLite database so they travel with the conlang file on export/import.

### Database API (`api.database`)

| Method | Description | Returns |
|--------|-------------|---------|
| `getStatus()` | Get database status and counts | `ApiResponse<DatabaseStatus>` |
| `export(format?)` | Export database as blob | `ApiResponse<Blob>` |
| `import(file)` | Import database from file | `Promise<ApiResponse<void>>` |
| `clear()` | Clear all data (keeps schema) | `ApiResponse<void>` |
| `reset()` | Drop and recreate all tables | `ApiResponse<void>` |

---

## SQL Structure

### Database Details

- **Storage Key**: `etymolog_db_v3`
- **Engine**: SQL.js (SQLite in browser)
- **Foreign Keys**: Enabled via `PRAGMA foreign_keys = ON`

### Tables

#### 1. `glyphs` — Atomic Visual Symbols

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT |
| `name` | TEXT | NOT NULL |
| `svg_data` | TEXT | NOT NULL |
| `category` | TEXT | NULLABLE |
| `notes` | TEXT | NULLABLE |
| `created_at` | TEXT | DEFAULT datetime('now') |
| `updated_at` | TEXT | DEFAULT datetime('now') |

**Indexes**: `idx_glyphs_name` on `name`

#### 2. `graphemes` — Composed Written Units

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT |
| `name` | TEXT | NOT NULL |
| `category` | TEXT | NULLABLE |
| `notes` | TEXT | NULLABLE |
| `created_at` | TEXT | DEFAULT datetime('now') |
| `updated_at` | TEXT | DEFAULT datetime('now') |

**Indexes**: `idx_graphemes_name` on `name`

#### 3. `grapheme_glyphs` — Junction Table

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT |
| `grapheme_id` | INTEGER | NOT NULL, FK → graphemes(id) ON DELETE CASCADE |
| `glyph_id` | INTEGER | NOT NULL, FK → glyphs(id) ON DELETE RESTRICT |
| `position` | INTEGER | NOT NULL DEFAULT 0 |
| `transform` | TEXT | NULLABLE (reserved for future) |

**Constraints**: UNIQUE(grapheme_id, glyph_id, position)
**Indexes**: `idx_grapheme_glyphs_grapheme`, `idx_grapheme_glyphs_glyph`, `idx_grapheme_glyphs_position`

#### 4. `phonemes` — Pronunciations

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT |
| `grapheme_id` | INTEGER | NOT NULL, FK → graphemes(id) ON DELETE CASCADE |
| `phoneme` | TEXT | NOT NULL (IPA notation) |
| `use_in_auto_spelling` | INTEGER | DEFAULT 0 (boolean) |
| `context` | TEXT | NULLABLE |

**Indexes**: `idx_phonemes_grapheme_id`

### Delete Behavior

| Operation | Behavior |
|-----------|----------|
| Delete Grapheme | Cascades to phonemes and grapheme_glyphs |
| Delete Glyph (normal) | **RESTRICTED** if in use by any grapheme |
| Delete Glyph (force) | Removes from grapheme_glyphs first |
| Delete Glyph (cascade) | Deletes grapheme_glyphs AND related graphemes |

---

## File Structure

```
src/
├── main.tsx                         # App entry point
├── App.tsx                          # Root component with providers
├── App.css                          # Global styles
├── index.css                        # CSS reset/base
│
├── db/                              # Database Layer
│   ├── index.ts                     # Barrel exports
│   ├── database.ts                  # SQL.js init & schema
│   ├── types.ts                     # TypeScript interfaces
│   ├── glyphService.ts              # Glyph CRUD (backend)
│   ├── graphemeService.ts           # Grapheme/Phoneme CRUD (backend)
│   ├── formHandler.ts               # Form-to-DB transformation
│   ├── useGlyphs.ts                 # Legacy hook (deprecated)
│   ├── useGraphemes.ts              # Legacy hook (deprecated)
│   ├── sql.js.d.ts                  # SQL.js type declarations
│   │
│   ├── api/                         # API Layer (virtual backend)
│   │   ├── index.ts
│   │   ├── types.ts                 # ApiResponse, Settings types
│   │   ├── glyphApi.ts
│   │   ├── graphemeApi.ts
│   │   ├── settingsApi.ts
│   │   └── databaseApi.ts
│   │
│   ├── context/                     # React Context
│   │   ├── index.ts
│   │   └── EtymologContext.tsx      # Provider & hooks
│   │
│   └── __tests__/                   # Test suite
│       ├── setup.ts
│       ├── glyphService.test.ts
│       ├── graphemeService.test.ts
│       └── edgeCases.test.ts
│
├── components/
│   ├── background/
│   │   └── background.tsx           # App background wrapper
│   │
│   ├── display/                     # Display Components
│   │   ├── glyphs/
│   │   │   └── glyphCard/
│   │   │       ├── glyphCard.tsx    # Versatile glyph card
│   │   │       └── glyphCard.module.scss
│   │   └── grapheme/
│   │       ├── compact/
│   │       │   └── compact.tsx      # Compact grapheme display
│   │       └── detailed/
│   │           └── detailed.tsx     # Detailed grapheme display
│   │
│   ├── form/                        # Form Components
│   │   ├── glyphForm/
│   │   │   ├── index.ts
│   │   │   ├── GlyphForm.tsx        # Standalone glyph form
│   │   │   ├── GlyphFormFields.tsx  # Reusable glyph fields
│   │   │   ├── EditGlyphModal.tsx   # Modal for inline editing
│   │   │   ├── glyphFormFields.module.scss
│   │   │   └── editGlyphModal.module.scss
│   │   ├── graphemeForm/
│   │   │   ├── index.ts
│   │   │   ├── GraphemeFormFields.tsx  # Reusable grapheme fields
│   │   │   └── graphemeFormFields.module.scss
│   │   └── customInput/
│   │       └── pronunciationTableInput/
│   │           ├── index.ts
│   │           ├── pronunciationTableInput.tsx
│   │           └── pronunciationTableInput.module.scss
│   │
│   ├── graphics/                    # Visual elements
│   │
│   └── tabs/                        # Tab Sections
│       ├── lexicon/
│       │   ├── main.tsx
│       │   ├── create/
│       │   │   └── createLexicon.tsx
│       │   └── view/
│       │       └── lexiconView.tsx
│       │
│       ├── grapheme/                # Script Maker tab
│       │   ├── main.tsx             # Tab container & routing
│       │   │
│       │   ├── galleryGrapheme/     # Grapheme Gallery
│       │   │   ├── galleryGrapheme.tsx
│       │   │   └── graphemeGallery.tsx
│       │   │
│       │   ├── galleryGlyphs/       # Glyph Gallery
│       │   │   └── galleryGlyphs.tsx
│       │   │
│       │   ├── newGrapheme/         # Create Grapheme
│       │   │   ├── newGrapheme.tsx
│       │   │   ├── newGrapheme.module.scss
│       │   │   └── NewGlyphModal.tsx
│       │   │
│       │   ├── newGlyph/            # Create Glyph
│       │   │   ├── NewGlyphForm.tsx
│       │   │   ├── NewGlyphModal.tsx
│       │   │   └── NewGlyphPage.tsx
│       │   │
│       │   ├── editGrapheme/        # Edit Grapheme
│       │   │   ├── index.ts
│       │   │   ├── GraphemeEditPage.tsx
│       │   │   └── graphemeEditPage.module.scss
│       │   │
│       │   └── editGlyph/           # Edit Glyph
│       │       ├── index.ts
│       │       ├── GlyphEditPage.tsx
│       │       └── glyphEditPage.module.scss
│       │
│       └── graphotactic/
│           └── main.tsx             # Placeholder
│
├── styles/                          # Shared styles
│
└── assets/                          # Static assets
```

---

## Testing

### Test Suite Overview

| File | Tests | Description |
|------|-------|-------------|
| `glyphService.test.ts` | ~50 | Glyph CRUD operations |
| `graphemeService.test.ts` | ~60 | Grapheme & phoneme operations |
| `edgeCases.test.ts` | ~30 | Integration & boundary cases |

**Total: 141 tests**

### Key Test Scenarios

- Glyph reusability across multiple graphemes
- Safe delete (preventing deletion of in-use glyphs)
- Force delete (removing glyph references)
- Cascade deletes (phonemes deleted with graphemes)
- Unicode/IPA support for phonemes
- Position ordering for glyphs in graphemes
- Auto-cleanup of orphaned glyphs when setting enabled
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

#### 3. Lexicon Feature Completion

**Current State**: Lexicon tab has placeholder components with basic structure
**Missing Features**:
- Word-to-grapheme linking
- Etymology tracking
- Automatic pronunciation generation from graphemes
- Part-of-speech categorization
- Search/filter by grapheme usage

**Recommendation**: Prioritize after core script-maker features are stable

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

**Conclusion**: No major duplication issues to address

### Future Enhancements

| Priority | Feature | Description |
|----------|---------|-------------|
| **High** | Settings migration to SQLite | Make conlang settings portable |
| **High** | Import/Export UI | Complete database backup/restore functionality |
| **Medium** | Lexicon completion | Word management with grapheme linking |
| **Medium** | Graphotactic rules | Define valid grapheme sequences |
| **Medium** | Glyph transforms | Rotation, scaling in grapheme composition |
| **Low** | Collaborative editing | Future server migration support |

---

## Contributing

When adding new features, please:

1. Follow the two-layer architecture (UI components use `useEtymolog()`)
2. Add tests for new service methods
3. Use `GlyphFormFields`/`GraphemeFormFields` for form consistency
4. Ensure buttons in forms have `type="button"` unless they're submit buttons
5. Update this README with route/component changes

---

*Last updated: January 2026*
