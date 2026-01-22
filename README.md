# Etymolog

A conlang (constructed language) script creation and management tool. Create custom writing systems with graphemes (script characters) and their associated phonemes (pronunciations).

## Features

- **Script Drawer**: Draw custom script characters using pen, shapes, and selection tools
- **Phoneme Management**: Associate multiple pronunciations with each grapheme
- **Auto-Spelling Support**: Mark phonemes for use in automatic spelling/transliteration
- **Local Database**: All data stored locally using SQL.js (SQLite in the browser)
- **Import/Export**: Save and load your language data

---

## Architecture

### Terminology

| UI Term (User-Friendly) | DB Term (Linguistic) | Description |
|------------------------|---------------------|-------------|
| Logogram / Script Character | Grapheme | A visual symbol in the writing system |
| Pronunciation | Phoneme | A sound associated with a grapheme |
| Auto-Spelling | `use_in_auto_spelling` | Whether this phoneme is used for automatic transliteration |

### Database Schema

```
┌─────────────────────────────────────┐
│            graphemes                │
├─────────────────────────────────────┤
│ id          INTEGER PRIMARY KEY     │
│ name        TEXT NOT NULL           │
│ svg_data    TEXT NOT NULL           │
│ notes       TEXT                    │
│ created_at  TEXT (datetime)         │
│ updated_at  TEXT (datetime)         │
└─────────────────────────────────────┘
                 │
                 │ 1:N
                 ▼
┌─────────────────────────────────────┐
│            phonemes                 │
├─────────────────────────────────────┤
│ id                    INTEGER PK    │
│ grapheme_id           INTEGER FK    │
│ phoneme               TEXT NOT NULL │
│ use_in_auto_spelling  INTEGER (0/1) │
│ context               TEXT          │
└─────────────────────────────────────┘
```

### Data Flow

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   Form Input     │     │  Form Handler    │     │    Database      │
│                  │     │                  │     │                  │
│ logogramSvg      │────▶│ transformForm    │────▶│ createGrapheme() │
│ logogramName     │     │ ToGraphemeInput  │     │                  │
│ notes            │     │                  │     │ Creates:         │
│ pronunciations[] │     │ Maps UI terms    │     │ - 1 grapheme     │
│   - pronunciation│     │ to DB terms      │     │ - N phonemes     │
│   - useInAuto... │     │                  │     │                  │
└──────────────────┘     └──────────────────┘     └──────────────────┘
```

---

## Database API

### Initialization

```typescript
import { initDatabase } from './db';

// Initialize on app startup
await initDatabase();
```

### Grapheme Operations

```typescript
import { 
  createGrapheme, 
  getGraphemeById, 
  getAllGraphemes,
  updateGrapheme,
  deleteGrapheme 
} from './db';

// Create a grapheme with phonemes
const grapheme = createGrapheme({
  name: 'A',
  svg_data: '<svg>...</svg>',
  notes: 'The first letter',
  phonemes: [
    { phoneme: 'a', use_in_auto_spelling: true },
    { phoneme: 'æ', use_in_auto_spelling: false }
  ]
});

// Get all graphemes with their phonemes
const all = getAllGraphemesWithPhonemes();
```

### React Hooks

```typescript
import { useGraphemes } from './db';

function MyComponent() {
  const { 
    graphemes,           // All graphemes
    isLoading,           // Loading state
    error,               // Error state
    create,              // Create grapheme
    update,              // Update grapheme
    remove,              // Delete grapheme
    refresh              // Refresh data
  } = useGraphemes();
}
```

---

## Form Integration

The `NewLogogramForm` component collects user input and transforms it for database storage:

### Form Output Structure

```typescript
interface LogogramFormData {
  logogramSvg: string;           // SVG drawing data
  logogramName: string;          // Character name
  notes: string;                 // Optional notes
  pronunciations: Array<{
    pronunciation: string;       // IPA or phonetic representation
    useInAutoSpelling: boolean;  // Include in auto-spelling
  }>;
}
```

### Transformation to Database Input

```typescript
// Form data → Database input
const dbInput: CreateGraphemeInput = {
  name: formData.logogramName,
  svg_data: formData.logogramSvg,
  notes: formData.notes || undefined,
  phonemes: formData.pronunciations.map(p => ({
    phoneme: p.pronunciation,
    use_in_auto_spelling: p.useInAutoSpelling
  }))
};
```

---

## File Structure

```
src/db/
├── index.ts              # Barrel exports
├── database.ts           # SQL.js initialization & persistence
├── types.ts              # TypeScript interfaces
├── graphemeService.ts    # CRUD operations for graphemes/phonemes
├── useGraphemes.ts       # React hooks
├── formHandler.ts        # Form-to-DB transformation
└── __tests__/
    └── graphemeService.test.ts  # Comprehensive tests
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

## Testing

Tests cover all edge cases including:

- Creating graphemes with/without phonemes
- Handling empty/null/undefined values
- Unicode and special characters in phonemes
- Duplicate name handling
- Cascade deletion of phonemes
- Auto-spelling flag management

See `src/db/__tests__/graphemeService.test.ts` for full test coverage.
