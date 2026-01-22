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

## Architecture

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
│ svg_data        │     │ position (order)        │     │ notes           │
│ notes           │     │ transform               │     │ created_at      │
│ created_at      │     └─────────────────────────┘     │ updated_at      │
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

### React Hooks

```typescript
import { useGlyphs, useGraphemes } from './db';

function MyComponent() {
  // Glyph management
  const { 
    glyphs,              // All glyphs
    glyphsWithUsage,     // Glyphs with usage count
    create: createGlyph,
    remove: removeGlyph,
  } = useGlyphs();

  // Grapheme management
  const { 
    graphemesComplete,   // All graphemes with glyphs + phonemes
    create: createGrapheme,
    updateGlyphs,        // Update glyph composition
    remove: removeGrapheme,
  } = useGraphemes();
}
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
src/db/
├── index.ts              # Barrel exports
├── database.ts           # SQL.js initialization & schema
├── types.ts              # TypeScript interfaces
├── glyphService.ts       # Glyph CRUD operations
├── graphemeService.ts    # Grapheme & phoneme CRUD operations
├── useGlyphs.ts          # React hook for glyphs
├── useGraphemes.ts       # React hook for graphemes
├── formHandler.ts        # Form-to-DB transformation
└── __tests__/
    ├── setup.ts                  # Test environment setup
    ├── glyphService.test.ts      # Glyph CRUD tests
    ├── graphemeService.test.ts   # Grapheme & phoneme tests
    └── edgeCases.test.ts         # Integration & edge case tests
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
