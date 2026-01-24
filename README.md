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

### Script Maker (Graphemes & Glyphs)

The Script Maker UI is available at the `/script-maker` route. It exposes nested subtabs for managing graphemes and glyphs:

- **Graphemes** (default): shows the grapheme gallery and composition tools.
- **Glyphs**: shows the glyph library (name on top, SVG preview in the middle).

#### Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/script-maker` | `GraphemeHome` | Grapheme gallery (default view) |
| `/script-maker/create` | `CreateGraphemePage` | Create a new grapheme |
| `/script-maker/grapheme/db/:id` | `GraphemeEditPage` | Edit an existing grapheme |
| `/script-maker/glyphs` | `GlyphsTab` | Glyph gallery |
| `/script-maker/glyphs/db/:id` | `GlyphEditPage` | Edit an existing glyph |

#### Key Component Locations

**Tab Structure:**
- `src/components/tabs/grapheme/main.tsx` — `GraphemeMain` (router-backed tab container for the Script Maker area)

**Galleries:**
- `src/components/tabs/grapheme/galleryGrapheme/graphemeGallery.tsx` — Grapheme gallery component (DataGallery-based)
- `src/components/tabs/grapheme/galleryGrapheme/galleryGrapheme.tsx` — Grapheme gallery view (connects to context)
- `src/components/tabs/grapheme/galleryGlyphs/galleryGlyphs.tsx` — Glyph gallery UI

**Create Forms:**
- `src/components/tabs/grapheme/newGrapheme/newGrapheme.tsx` — Create grapheme form
- `src/components/tabs/grapheme/newGrapheme/NewGlyphModal.tsx` — Create glyph modal (used within grapheme creation)

**Edit Pages:**
- `src/components/tabs/grapheme/editGlyph/GlyphEditPage.tsx` — Glyph editing page
- `src/components/tabs/grapheme/editGrapheme/GraphemeEditPage.tsx` — Grapheme editing page

**Shared Form Components:**
- `src/components/form/glyphForm/GlyphFormFields.tsx` — Reusable glyph form fields (SVG drawer, name, category, notes)
- `src/components/form/glyphForm/EditGlyphModal.tsx` — Modal wrapper for editing glyphs inline (used in GraphemeFormFields)
- `src/components/form/graphemeForm/GraphemeFormFields.tsx` — Reusable grapheme form fields (glyph selection with inline editing, name, category, notes, pronunciations)

**Display Components:**
- `src/components/display/glyphs/glyphCard/glyphCard.tsx` — Versatile glyph card with configurable interaction modes:
  - `interactionMode='route'` (default): Navigate to edit page
  - `interactionMode='modal'`: Trigger onClick callback for inline modal editing
  - `interactionMode='none'`: Display only, no click interaction
- `src/components/display/grapheme/compact/compact.tsx` — Compact grapheme display (clickable)
- `src/components/display/grapheme/detailed/detailed.tsx` — Detailed grapheme display

#### Form Architecture

The form components follow a modular pattern where create and edit pages share common form field components:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Shared Form Components                       │
├─────────────────────────────────────────────────────────────────┤
│  GlyphFormFields                 GraphemeFormFields             │
│  ├── SVG Drawer                  ├── Glyph Selection Area       │
│  ├── Name Input                  │   └── GlyphCard (modal mode) │
│  ├── Category Input              ├── Name Input                 │
│  └── Notes Input                 ├── Category Input             │
│                                  ├── Notes Input                │
│                                  └── Pronunciation Table        │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌─────────────────────┐ ┌─────────────────────┐ ┌─────────────────────┐
│   NewGlyphModal     │ │   EditGlyphModal    │ │   GlyphEditPage     │
│   (mode: "create")  │ │   (mode: "edit")    │ │   (mode: "edit")    │
│   Inline in form    │ │   Inline in form    │ │   Standalone page   │
└─────────────────────┘ └─────────────────────┘ └─────────────────────┘
              ▼                               ▼
┌─────────────────────────┐    ┌─────────────────────────┐
│   NewGraphemeForm       │    │   GraphemeEditPage      │
│   (mode: "create")      │    │   (mode: "edit")        │
└─────────────────────────┘    └─────────────────────────┘
```

#### GlyphCard Interaction Modes

The `GlyphCard` component supports three interaction modes for flexibility:

| Mode | Prop Value | Behavior | Use Case |
|------|------------|----------|----------|
| Route | `interactionMode="route"` | Navigates to `/script-maker/glyphs/db/:id` | Glyph gallery (standalone editing) |
| Modal | `interactionMode="modal"` | Calls `onClick` callback | GraphemeFormFields (inline editing) |
| None | `interactionMode="none"` | No click interaction | Display-only contexts |

```tsx
// Route mode (default) - navigates to edit page
<GlyphCard glyph={glyph} onDelete={handleDelete} />

// Modal mode - triggers onClick for inline editing
<GlyphCard 
    glyph={glyph} 
    interactionMode="modal"
    onClick={(glyph) => openEditModal(glyph)}
    onDelete={handleRemove}
/>

// Display only - no interaction
<GlyphCard glyph={glyph} interactionMode="none" hideDelete />
```

#### Routing Notes

- The app uses `RouterTabContainer` for nested route-based subtabs under `/script-maker`.
- Subtabs map to `/script-maker` (graphemes) and `/script-maker/glyphs` (glyphs).
- Edit pages are accessed by clicking on gallery items (GlyphCard or CompactGraphemeDisplay).
- Each edit page includes delete functionality with confirmation modals.

#### SmartForm Integration (IMPORTANT)

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

**Performance Note:** Calling `registerField` on every render is intentional and efficient. SmartForm:
1. Uses internal caching for handlers (stable references)
2. Only processes new field registrations once via `useLayoutEffect`
3. Returns computed values from React state (necessary for reactivity)

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

### Data Flow

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   Glyph Form     │     │    Database      │     │  Grapheme Form   │
│                  │     │                  │     │                  │
│ Draw SVG         │────▶│ createGlyph()    │     │ Select glyph(s)  │
│ Enter name       │     │                  │     │ Enter name       │
│ Add notes        │     │ Creates:         │◄────│ Add phonemes     │
│                  │     │ - 1 glyph        │     │                  │
└──────────────────┘     │                  │     └──────────────────┘
                         │ createGrapheme() │
                         │                  │
                         │ Creates:         │
                         │ - 1 grapheme     │
                         │ - N glyph links  │
                         │ - N phonemes     │
                         └──────────────────┘
```

---

## Two-Layer Architecture

Etymolog uses a **virtual frontend/backend** architecture to separate UI concerns from data operations. Even though this is a PWA running entirely client-side, we maintain clean separation as if it were a client-server application.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND LAYER                                  │
│  (React Components)                                                         │
│                                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│  │ GlyphGallery│  │GraphemeView │  │ NewGrapheme │  │ Settings    │       │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘       │
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

### Using the Context

```tsx
import { EtymologProvider, useEtymolog } from './db';

// Wrap your app with the provider
function App() {
  return (
    <EtymologProvider>
      <MyApp />
    </EtymologProvider>
  );
}

// Use the hook in components
function GlyphList() {
  const { api, data, isLoading, error } = useEtymolog();

  if (isLoading) return <Spinner />;
  if (error) return <ErrorDisplay error={error} />;

  const handleCreate = () => {
    const result = api.glyph.create({
      name: 'New Glyph',
      svg_data: '<svg>...</svg>'
    });
    
    if (!result.success) {
      console.error('Failed:', result.error?.message);
    }
    // Data auto-refreshes, no manual refresh needed
  };

  return (
    <div>
      <button onClick={handleCreate}>Add Glyph</button>
      {data.glyphs.map(g => <GlyphCard key={g.id} glyph={g} />)}
    </div>
  );
}
```

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

### Settings API

Application settings are managed through the settings API. Settings are **not stored in the database** but are persisted to localStorage separately.

#### Available Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `simpleScriptSystem` | `boolean` | `false` | Reserved for future use. When enabled, may simplify the script system by treating each grapheme as a single glyph. |
| `defaultGalleryView` | `'compact' \| 'detailed' \| 'expanded'` | `'compact'` | Default view mode for galleries. |
| `autoSaveInterval` | `number` | `0` | Auto-save interval in milliseconds. 0 = disabled. |

#### Usage

```tsx
const { settings, updateSettings, resetSettings } = useEtymologSettings();

// Read current settings
console.log(settings.simpleScriptSystem); // false

// Update settings (partial update supported)
updateSettings({ simpleScriptSystem: true });

// Reset to defaults
resetSettings();
```

Settings are persisted to localStorage and automatically loaded on app start.

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

### Complete API Reference

The `api` object from `useEtymolog()` provides the following methods:

#### Glyph API (`api.glyph`)

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

#### Grapheme API (`api.grapheme`)

| Method | Description | Returns |
|--------|-------------|---------|
| `create(request)` | Create a grapheme with glyphs and phonemes | `ApiResponse<GraphemeComplete>` |
| `getById(id)` | Get basic grapheme info | `ApiResponse<Grapheme>` |
| `getByIdComplete(id)` | Get grapheme with glyphs + phonemes | `ApiResponse<GraphemeComplete>` |
| `getAll()` | Get all graphemes (basic) | `ApiResponse<GraphemeListResponse>` |
| `getAllComplete()` | Get all graphemes with full data | `ApiResponse<GraphemeCompleteListResponse>` |
| `search(query)` | Search graphemes by name | `ApiResponse<GraphemeListResponse>` |
| `update(id, request)` | Update grapheme metadata | `ApiResponse<Grapheme>` |
| `updateGlyphs(id, request)` | Replace grapheme's glyph composition | `ApiResponse<void>` |
| `delete(id)` | Delete grapheme (cascades to phonemes) | `ApiResponse<void>` |

#### Phoneme API (`api.phoneme`)

| Method | Description | Returns |
|--------|-------------|---------|
| `add(request)` | Add a phoneme to a grapheme | `ApiResponse<Phoneme>` |
| `getById(id)` | Get a phoneme by ID | `ApiResponse<Phoneme>` |
| `getByGraphemeId(graphemeId)` | Get all phonemes for a grapheme | `ApiResponse<Phoneme[]>` |
| `update(id, request)` | Update a phoneme | `ApiResponse<Phoneme>` |
| `delete(id)` | Delete a phoneme | `ApiResponse<void>` |
| `deleteAllForGrapheme(graphemeId)` | Delete all phonemes for a grapheme | `ApiResponse<number>` |
| `getAutoSpelling()` | Get all phonemes marked for auto-spelling | `ApiResponse<Phoneme[]>` |

#### Settings API (`api.settings`)

| Method | Description | Returns |
|--------|-------------|---------|
| `get()` | Get current settings | `ApiResponse<EtymologSettings>` |
| `update(settings)` | Update settings (partial) | `ApiResponse<EtymologSettings>` |
| `reset()` | Reset settings to defaults | `ApiResponse<EtymologSettings>` |

#### Database API (`api.database`)

| Method | Description | Returns |
|--------|-------------|---------|
| `getStatus()` | Get database status and counts | `ApiResponse<DatabaseStatus>` |
| `export(format?)` | Export database as blob | `ApiResponse<Blob>` |
| `import(file)` | Import database from file | `Promise<ApiResponse<void>>` |
| `clear()` | Clear all data (keeps schema) | `ApiResponse<void>` |
| `reset()` | Drop and recreate all tables | `ApiResponse<void>` |

### Migration from Legacy Hooks

The old hooks (`useGlyphs`, `useGraphemes`) are deprecated but still available:

```tsx
// Old way (deprecated)
import { useGlyphs, useGraphemes } from './db';
const { glyphs, create } = useGlyphs();
const { graphemesComplete } = useGraphemes();

// New way (recommended)
import { useEtymolog } from './db';
const { api, data } = useEtymolog();
// api.glyph.create(), data.glyphs, data.graphemesComplete
```

---

## SQL structure

The app stores its local database using SQL.js (SQLite in the browser). The schema is defined and created in `src/db/database.ts` (see `createTables`) and mirrors the TypeScript interfaces in `src/db/types.ts`.

Quick facts
- Persistent key in localStorage: `etymolog_db_v3` (`DB_STORAGE_KEY`).
- Foreign keys enabled at runtime via `PRAGMA foreign_keys = ON`.
- Migrations are run on startup; v3 adds `category` columns if missing (see `runMigrations`).

Tables

1) `glyphs` — atomic visual symbols (SVG drawings)
- id: INTEGER PRIMARY KEY AUTOINCREMENT
- name: TEXT NOT NULL
- svg_data: TEXT NOT NULL
- category: TEXT (nullable)
- notes: TEXT (nullable)
- created_at: TEXT DEFAULT (datetime('now'))
- updated_at: TEXT DEFAULT (datetime('now'))

Indexes:
- `idx_glyphs_name` on `glyphs(name)` (fast name lookup)


2) `graphemes` — composed written units
- id: INTEGER PRIMARY KEY AUTOINCREMENT
- name: TEXT NOT NULL
- category: TEXT (nullable)
- notes: TEXT (nullable)
- created_at: TEXT DEFAULT (datetime('now'))
- updated_at: TEXT DEFAULT (datetime('now'))

Indexes:
- `idx_graphemes_name` on `graphemes(name)`


3) `grapheme_glyphs` — junction table linking glyphs to graphemes (ordered)
- id: INTEGER PRIMARY KEY AUTOINCREMENT
- grapheme_id: INTEGER NOT NULL — FOREIGN KEY references `graphemes(id)` ON DELETE CASCADE
- glyph_id: INTEGER NOT NULL — FOREIGN KEY references `glyphs(id)` ON DELETE RESTRICT
- position: INTEGER NOT NULL DEFAULT 0 — ordering of glyphs within a grapheme
- transform: TEXT (nullable) — reserved for rotation/scale/offset metadata

Constraints and indexes:
- UNIQUE(grapheme_id, glyph_id, position) to avoid duplicate slot entries
- `idx_grapheme_glyphs_grapheme` on `(grapheme_id)`
- `idx_grapheme_glyphs_glyph` on `(glyph_id)`
- `idx_grapheme_glyphs_position` on `(grapheme_id, position)` (fast ordering)

Behavior note:
- Deleting a grapheme cascades and removes its `grapheme_glyphs` rows.
- Deleting a glyph is restricted if it's referenced by any `grapheme_glyphs` row (unless the app forces removal).


4) `phonemes` — pronunciations associated with a grapheme
- id: INTEGER PRIMARY KEY AUTOINCREMENT
- grapheme_id: INTEGER NOT NULL — FOREIGN KEY references `graphemes(id)` ON DELETE CASCADE
- phoneme: TEXT NOT NULL (IPA or other notation)
- use_in_auto_spelling: INTEGER DEFAULT 0 (stored as 0/1; mapped to boolean in TypeScript)
- context: TEXT (nullable)

Indexes:
- `idx_phonemes_grapheme_id` on `(grapheme_id)`


Relationship summary
- Glyph ←(N:M)→ Grapheme via `grapheme_glyphs` (with `position` ordering). The junction uses ON DELETE RESTRICT for `glyph_id` to protect glyphs from accidental removal.
- Grapheme ←(1:N)→ Phoneme. Phonemes are cascade-deleted when their parent grapheme is deleted.

Practical implications
- Creating a glyph writes to `glyphs`.
- Creating a grapheme writes to `graphemes`, then to `grapheme_glyphs` for each linked glyph (preserving `position`), and optional `phonemes` rows for pronunciations.
- Deleting a grapheme will remove associated phonemes and junction rows automatically (cascade). Attempting to delete a glyph that is in use will fail unless the app explicitly forces removal and cleans references.

Notes for developers
- The schema is created in `createTables(database)` and logged as "v3 schema with category".
- Migrations currently alter existing tables to add `category` columns when detecting older schemas — full data-preserving migrations are TODO.
- Boolean flags (like `use_in_auto_spelling`) are stored as INTEGER (0/1) in SQLite and mapped to booleans in TypeScript interfaces in `src/db/types.ts`.

## Database API

### Initialization

```typescript
import { initDatabase } from './db';

// Initialize on app startup
await initDatabase();
```

### Glyph Operations

```typescript
import { 
  createGlyph, 
  getGlyphById, 
  getAllGlyphs,
  getAllGlyphsWithUsage,
  updateGlyph,
  deleteGlyph 
} from './db';

// Create a glyph (atomic visual symbol)
const glyph = createGlyph({
  name: 'Base A',
  svg_data: '<svg>...</svg>',
  notes: 'The base form of letter A'
});

// Get all glyphs with usage count
const glyphsWithUsage = getAllGlyphsWithUsage();
// Returns: [{ ...glyph, usageCount: 3 }, ...]
```

### Grapheme Operations

```typescript
import { 
  createGrapheme, 
  getGraphemeComplete,
  getAllGraphemesComplete,
  setGraphemeGlyphs
} from './db';

// Create a grapheme using existing glyph(s)
const grapheme = createGrapheme({
  name: 'A',
  notes: 'The letter A',
  glyphs: [
    { glyph_id: 1, position: 0 },  // Base glyph
    { glyph_id: 5, position: 1 }   // Optional diacritical mark
  ],
  phonemes: [
    { phoneme: 'a', use_in_auto_spelling: true },
    { phoneme: 'æ', use_in_auto_spelling: false }
  ]
});

// Get grapheme with all data (glyphs + phonemes)
const complete = getGraphemeComplete(1);
// Returns: { ...grapheme, glyphs: [...], phonemes: [...] }
```

### React Hooks (DEPRECATED)

> **Note**: The `useGlyphs` and `useGraphemes` hooks are deprecated. Use `useEtymolog()` instead.

```typescript
// ❌ Old way (deprecated)
import { useGlyphs, useGraphemes } from './db';
const { glyphs, create } = useGlyphs();
const { graphemesComplete } = useGraphemes();

// ✅ New way (recommended)
import { useEtymolog } from './db';
const { api, data } = useEtymolog();
// api.glyph.create(), data.glyphs, data.graphemesComplete
```

---

## Form Integration

### Combined Workflow (Most Common)

The most common workflow is to create a glyph and immediately use it in a grapheme:

```typescript
import { saveGlyphAndGrapheme } from './db';

const result = await saveGlyphAndGrapheme({
  // Glyph data
  glyphSvg: '<svg>...</svg>',
  glyphName: 'A',
  glyphNotes: 'Base letter A',
  // Grapheme data (optional - falls back to glyph name)
  graphemeName: 'A',
  // Pronunciations
  pronunciations: [
    { pronunciation: 'a', useInAutoSpelling: true }
  ]
});

// Result: { glyph: {...}, grapheme: {...} }
```

### Separate Workflows

For more complex use cases (like creating compound graphemes):

```typescript
import { saveGlyph, saveGrapheme } from './db';

// Step 1: Create glyphs
const baseGlyph = await saveGlyph({ glyphSvg: '...', glyphName: 'Base' });
const accentGlyph = await saveGlyph({ glyphSvg: '...', glyphName: 'Accent' });

// Step 2: Create grapheme using both glyphs
const grapheme = await saveGrapheme({
  graphemeName: 'Accented Base',
  glyphIds: [baseGlyph.id, accentGlyph.id],  // Order matters!
  pronunciations: [{ pronunciation: 'á', useInAutoSpelling: true }]
});
```

---

## File Structure

```
src/
├── components/
│   ├── background/
│   │   └── background.tsx           # App background wrapper
│   ├── display/
│   │   ├── glyphs/
│   │   │   └── glyphCard/
│   │   │       ├── glyphCard.tsx        # Versatile glyph card (route/modal/none modes)
│   │   │       └── glyphCard.module.scss
│   │   └── grapheme/
│   │       ├── compact/
│   │       │   └── compact.tsx          # Compact grapheme display (clickable)
│   │       └── detailed/
│   │           └── detailed.tsx         # Detailed grapheme display
│   ├── form/
│   │   ├── glyphForm/
│   │   │   ├── index.ts                 # Barrel exports
│   │   │   ├── GlyphFormFields.tsx      # Shared glyph form fields
│   │   │   ├── glyphFormFields.module.scss
│   │   │   ├── EditGlyphModal.tsx       # Modal for inline glyph editing
│   │   │   └── editGlyphModal.module.scss
│   │   ├── graphemeForm/
│   │   │   ├── index.ts
│   │   │   ├── GraphemeFormFields.tsx   # Shared grapheme form fields (with inline glyph editing)
│   │   │   └── graphemeFormFields.module.scss
│   │   └── customInput/
│   │       └── pronunciationTableInput/ # IPA pronunciation table input
│   └── tabs/
│       └── grapheme/
│           ├── main.tsx                 # Script Maker routing container
│           ├── galleryGrapheme/
│           │   ├── galleryGrapheme.tsx  # Grapheme gallery view wrapper
│           │   └── graphemeGallery.tsx  # Grapheme gallery component
│           ├── galleryGlyphs/
│           │   └── galleryGlyphs.tsx    # Glyph gallery component
│           ├── newGrapheme/
│           │   ├── newGrapheme.tsx      # Create grapheme form
│           │   └── NewGlyphModal.tsx    # Create glyph modal
│           ├── editGlyph/
│           │   ├── index.ts
│           │   ├── GlyphEditPage.tsx    # Edit glyph page
│           │   └── glyphEditPage.module.scss
│           └── editGrapheme/
│               ├── index.ts
│               ├── GraphemeEditPage.tsx # Edit grapheme page
│               └── graphemeEditPage.module.scss
├── db/
│   ├── index.ts              # Barrel exports (context, API, types, legacy)
│   ├── database.ts           # SQL.js initialization & schema
│   ├── types.ts              # TypeScript interfaces for data models
│   ├── glyphService.ts       # Glyph CRUD operations (backend layer)
│   ├── graphemeService.ts    # Grapheme & phoneme CRUD (backend layer)
│   ├── formHandler.ts        # Form-to-DB transformation (legacy)
│   ├── useGlyphs.ts          # React hook for glyphs (deprecated)
│   ├── useGraphemes.ts       # React hook for graphemes (deprecated)
│   ├── api/                  # API Layer (virtual backend)
│   │   ├── index.ts          # API barrel exports
│   │   ├── types.ts          # API types (ApiResponse, Settings, etc.)
│   │   ├── glyphApi.ts       # Glyph API with standardized responses
│   │   ├── graphemeApi.ts    # Grapheme & Phoneme APIs
│   │   ├── settingsApi.ts    # Settings management API
│   │   └── databaseApi.ts    # Database management API
│   ├── context/              # React Context (frontend interface)
│   │   ├── index.ts          # Context barrel exports
│   │   └── EtymologContext.tsx  # Provider & hooks
│   └── __tests__/
│       ├── setup.ts                  # Test environment setup
│       ├── glyphService.test.ts      # Glyph CRUD tests
│       ├── graphemeService.test.ts   # Grapheme & phoneme tests
│       └── edgeCases.test.ts         # Integration & edge case tests
└── ...
```

---

## Testing

The test suite covers 141 tests across 3 test files:

### Test Files

| File | Description | Coverage |
|------|-------------|----------|
| `glyphService.test.ts` | Atomic glyph CRUD operations | Create, retrieve, update, delete, search, usage tracking |
| `graphemeService.test.ts` | Grapheme composition & phonemes | Create, glyph linking, reordering, phoneme management |
| `edgeCases.test.ts` | Integration & boundary tests | Glyph reuse, cascading deletes, concurrent operations |

### Key Test Scenarios

- **Glyph Reusability**: Same glyph used across multiple graphemes
- **Safe Delete**: Prevents deletion of glyphs that are in use
- **Force Delete**: Removes glyphs even when referenced
- **Cascade Deletes**: Phonemes are deleted when grapheme is deleted
- **Unicode Support**: Full IPA character support for phonemes
- **Position Ordering**: Glyphs maintain their order in graphemes

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run with coverage
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

# Run tests in watch mode  
pnpm test -- --watch

# Build for production
pnpm build
```

---

## Database Migration

The database uses versioned storage keys. When upgrading from v1 (old schema without glyphs table) to v2:

- The database will automatically detect the old schema
- Currently, this triggers a fresh database creation (data loss)
- TODO: Implement proper migration to preserve existing data

To manually reset the database:

```typescript
import { resetDatabase } from './db';

// Drops all tables and recreates fresh schema
resetDatabase();
```
