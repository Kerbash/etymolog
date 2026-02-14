# Phrase Translator

## Overview

The Phrase Translator allows users to translate English phrases into their constructed language by automatically looking up words in the lexicon and using autospelling for unknown words.

## How It Works

1. **User Input**: User enters an English phrase in the text area
2. **Tokenization**: System splits the phrase into individual words
3. **Word Translation**: For each word:
   - **Lexicon Lookup**: Search for the word in the lexicon (case-insensitive by lemma)
   - **If Found**: Use the word's defined spelling from the lexicon
   - **If Not Found**: Use the autospeller to generate spelling character-by-character
4. **Word Separation**: Insert virtual space glyphs (IPA ' ') between words
5. **Display**: Render the complete translation on a pannable/zoomable canvas
6. **Export**: Allow export as SVG or PNG

## Components

### TranslatorHome
Main container component that orchestrates the translation workflow.
- Manages state for input phrase, translation result, and layout strategy
- Implements debounced translation (300ms delay)
- Coordinates child components

### PhraseInput
Text area input for entering English phrases.
- Character count display
- Auto-focus on mount
- Accessible label

### TranslationControls
Controls for selecting display layout strategy.
- Dropdown selector for 8 layout strategies:
  - Left to Right (LTR)
  - Right to Left (RTL)
  - Top to Bottom (TTB)
  - Bottom to Top (BTT)
  - Block (wrapping)
  - Circular
  - Spiral
  - Boustrophedon

### PhraseDisplay
Canvas display wrapper for the translated phrase.
- Uses `GlyphSpellingDisplay` component for rendering
- Interactive mode with pan/zoom/viewport control
- Shows translation metadata (word count, lexicon vs autospell)
- Warning indicator for virtual glyphs

### ExportDropdown
Dropdown menu for exporting translations.
- Export as SVG (vector format)
- Export as PNG (2x resolution for retina displays)
- Auto-generated filenames with timestamps

## Architecture

### Data Flow

```
User Input
    ↓
Tokenization (phraseService.tokenizePhrase)
    ↓
For each word:
    ↓
Lookup in Lexicon (phraseService.lookupWord)
    ↓ (not found)
Autospell Fallback (autoSpellService.generateSpellingWithFallback)
    ↓
Combine with Separators (phraseService.translatePhrase)
    ↓
Render on Canvas (GlyphSpellingDisplay)
    ↓
Export (export utilities)
```

### Key Files

**Services:**
- `src/db/phraseService.ts` - Core translation logic
- `src/db/api/phraseApi.ts` - API wrapper
- `src/db/autoSpellService.ts` - Autospelling fallback

**Components:**
- `src/components/tabs/translator/TranslatorHome.tsx` - Main container
- `src/components/tabs/translator/_components/*` - UI components

**Utilities:**
- `packages/utils-func/graphic/export/*` - SVG/PNG export utilities

### Type Definitions

```typescript
interface PhraseWord {
  originalWord: string;      // "Hello"
  normalizedWord: string;    // "hello"
  position: number;          // 0
}

interface PhraseWordTranslation {
  word: PhraseWord;
  type: 'lexicon' | 'autospell';
  lexiconEntry?: LexiconComplete;
  spellingDisplay: SpellingDisplayEntry[];
  hasVirtualGlyphs: boolean;
}

interface PhraseTranslationResult {
  originalPhrase: string;
  normalizedPhrase: string;
  wordTranslations: PhraseWordTranslation[];
  combinedSpelling: SpellingDisplayEntry[];
  hasVirtualGlyphs: boolean;
  timestamp: string;
}
```

## Current Implementation

### Features Implemented
- ✅ Phrase input with character counter
- ✅ Word tokenization and normalization
- ✅ Lexicon lookup (case-insensitive)
- ✅ Autospelling fallback for unknown words
- ✅ Virtual space glyphs as word separators
- ✅ All 8 layout strategy support
- ✅ Interactive canvas (pan/zoom/viewport)
- ✅ SVG export (with padding and background)
- ✅ PNG export (2x resolution)
- ✅ Auto-generated filenames
- ✅ Translation metadata display
- ✅ Virtual glyph warning indicator
- ✅ Debounced translation (300ms)

### Limitations
- Autospelling is character-by-character (not phonologically accurate for English)
- No translation history/caching
- Single-line output only

## Future Enhancements

See the plan document for a complete list of future enhancements, including:

- [ ] Translation history/cache in context
- [ ] Batch translation from uploaded file
- [ ] Copy to clipboard
- [ ] Share translation URL
- [ ] Custom export templates
- [ ] Pronunciation hints for better autospell accuracy
- [ ] Multi-line phrase support with line breaks
- [ ] Translation editing (adjust word choices)
- [ ] Save favorite translations
- [ ] IPA input mode for more accurate autospelling

### Implemented Features

- [x] Customizable word separator graphemes (via `/script-maker/punctuation`)
- [x] Customizable punctuation graphemes (via `/script-maker/punctuation`)
- [x] Option to hide word separators or punctuation entirely

## Usage Example

```tsx
import TranslatorMain from './components/tabs/translator/main';

function App() {
  return <TranslatorMain />;
}
```

## API Usage

```typescript
import { useEtymolog } from './components/context/EtymologContext';

function MyComponent() {
  const { api } = useEtymolog();

  // Translate a phrase
  const result = api.phrase.translate('hello world');

  if (result.success && result.data) {
    console.log('Translation:', result.data);
    console.log('Words translated:', result.data.wordTranslations.length);
    console.log('Has virtual glyphs:', result.data.hasVirtualGlyphs);
  }
}
```

## Testing

Run tests with:
```bash
npm test phraseService
npm test translator
```

## Dependencies

- `react` - UI framework
- `react-zoom-pan-pinch` - Pan/zoom functionality
- `cyber-components` - UI component library
- `utils-func` - Utility functions
- `dompurify` - SVG sanitization

## Notes

- Phrase translations are **ephemeral** (not persisted to database)
- All data comes from existing lexicon entries
- Translations can be regenerated from lexicon at any time
- Virtual glyphs (dashed boxes) indicate characters without grapheme mappings
