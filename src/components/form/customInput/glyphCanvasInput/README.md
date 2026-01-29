# GlyphCanvasInput Component

A form input component for selecting and displaying ordered glyph sequences with support for multiple writing directions and virtual IPA glyph fallbacks.

## Features

- **Pannable/Zoomable Canvas**: Display selected glyphs with pan and zoom support
- **Multiple Writing Directions**: LTR, RTL, TTB, BTT, and custom layouts
- **Glyph Keyboard Overlay**: Bottom-pinned keyboard for glyph selection
- **IPA Keyboard Mode**: Virtual glyph creation from IPA characters
- **Virtual Glyph System**: Auto-generate fallback glyphs for unmapped IPA characters
- **SmartForm Integration**: Works with the SmartForm field registration system

## Architecture

```
GlyphCanvasInput/
├── GlyphCanvasInput.tsx    # Main component with form integration
├── GlyphCanvas.tsx         # Display canvas with pan/zoom
├── GlyphKeyboardOverlay.tsx # Glyph/IPA selection keyboard
├── types.ts                # Type definitions
├── strategies.ts           # Insertion/removal strategies
├── utils/
│   ├── index.ts            # Utility exports
│   ├── layoutUtils.ts      # Glyph positioning calculations
│   ├── graphemeUtils.ts    # Grapheme normalization
│   └── virtualGlyphUtils.ts # Virtual glyph generation
└── *.module.scss           # Component styles
```

## Usage

### Basic Usage with SmartForm

```tsx
import { GlyphCanvasInput } from './glyphCanvasInput';
import { useSmartForm } from 'smart-form';

function MyForm() {
    const { registerField } = useSmartForm();
    const glyphField = registerField('spelling', { defaultValue: [] });

    return (
        <GlyphCanvasInput
            {...glyphField}
            availableGlyphs={glyphs}
            direction="ltr"
            label="Word Spelling"
        />
    );
}
```

### With IPA Mode Enabled

```tsx
<GlyphCanvasInput
    {...glyphField}
    availableGlyphs={glyphs}
    enableIpaMode={true}
    onSelectionChange={(ids, hasVirtual) => {
        console.log('Selection:', ids);
        console.log('Has virtual glyphs:', hasVirtual);
    }}
/>
```

## Writing Directions

The component supports multiple writing directions via the `direction` prop:

| Direction | Description | Example Scripts |
|-----------|-------------|-----------------|
| `ltr` | Left-to-right (default) | Latin, Greek, Cyrillic |
| `rtl` | Right-to-left | Arabic, Hebrew |
| `ttb` | Top-to-bottom | Traditional Chinese, Japanese |
| `btt` | Bottom-to-top | Rare, for specialized use |
| `custom` | Custom layout callback | User-defined |

### Custom Layout

```tsx
<GlyphCanvasInput
    {...glyphField}
    direction="custom"
    canvasLayout={{
        direction: 'custom',
        customLayout: (glyphs, config) => {
            // Return array of CanvasGlyph with positions
            return glyphs.map((glyph, i) => ({
                glyph,
                x: /* custom x */,
                y: /* custom y */,
                width: config.glyphWidth,
                height: config.glyphHeight,
                index: i,
            }));
        },
    }}
/>
```

## Virtual Glyph System

Virtual glyphs are auto-generated SVG representations of IPA characters used when:
1. Auto-spell cannot find a grapheme mapping for a phoneme
2. User selects an IPA character from the IPA keyboard

### Characteristics

- **Negative IDs**: Virtual glyphs have negative IDs (e.g., -259831) to distinguish from real database glyphs
- **Deterministic**: Same IPA character always produces the same ID
- **Visual Distinction**: Rendered with dashed border and muted background
- **Tooltip**: Shows "IPA Fallback: [character]" on hover

### Creating Virtual Glyphs Programmatically

```tsx
import { createVirtualGlyph, isVirtualGlyphId } from './utils';

// Create a virtual glyph for schwa
const schwaGlyph = createVirtualGlyph('ə', 'Mid central vowel');

// Check if an ID is virtual
if (isVirtualGlyphId(glyphId)) {
    console.log('This is a virtual glyph');
}
```

### Auto-Spell with Fallback

```tsx
import { generateSpellingWithFallback } from '@/db/autoSpellService';

const result = generateSpellingWithFallback('həˈloʊ');
// result.hasVirtualGlyphs indicates if fallbacks were used
// result.spelling contains mixed real and virtual glyph IDs
```

## Keyboard Modes

The keyboard overlay supports two modes:

### Glyphs Mode (default)
- Shows available glyphs from the database
- Grouped by category
- Searchable by name

### IPA Mode
- Shows complete IPA character set
- All characters in single "IPA" category
- Selecting creates a virtual glyph

Toggle between modes using the "Glyphs" / "IPA" buttons in the keyboard header.

## Props

### GlyphCanvasInputProps

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `registerSmartFieldProps` | `object` | required | From SmartForm's registerField |
| `fieldState` | `object` | required | From SmartForm's registerField |
| `availableGlyphs` | `Glyph[]` | `[]` | Available glyphs for selection |
| `defaultValue` | `number[]` | `[]` | Initial selected glyph IDs |
| `direction` | `WritingDirection` | `'ltr'` | Writing direction |
| `insertionStrategy` | `InsertionStrategy` | append | Glyph insertion behavior |
| `searchable` | `boolean` | `true` | Enable keyboard search |
| `canvasLayout` | `Partial<CanvasLayoutConfig>` | `{}` | Layout configuration |
| `keyboardHeight` | `string` | `'260px'` | Keyboard overlay height |
| `label` | `string` | `'Glyph Sequence'` | Field label |
| `enableIpaMode` | `boolean` | `false` | Enable IPA keyboard mode |
| `onSelectionChange` | `(ids, hasVirtual) => void` | - | Selection change callback |
| `autoSpellPreview` | `AutoSpellResult` | `null` | Auto-spell preview data |
| `onRequestAutoSpell` | `() => void` | - | Request auto-spell handler |

## Ref Methods

The component exposes these methods via ref:

```tsx
const ref = useRef<GlyphCanvasInputRef>(null);

// Access current value
ref.current.value; // number[]

// Canvas controls
ref.current.resetCanvasView();
ref.current.fitCanvasToView();

// Keyboard controls
ref.current.openKeyboard();
ref.current.closeKeyboard();

// Selection controls
ref.current.clear();
ref.current.setValue([1, 2, 3]);
```

## Styling

The component uses CSS modules with CSS custom properties for theming:

```css
--surface-base
--surface-raised
--border-primary
--text-primary
--text-secondary
--interactive-base
--interactive-hover
--status-warning
--focus-ring
```

### Virtual Glyph Styling

Virtual glyphs use distinct styling:
- Dashed border with `--status-warning` color
- Muted background (`--surface-base`)
- Slightly reduced opacity

## Extension Points

### Custom Insertion Strategy

```tsx
const myStrategy: InsertionStrategy = {
    name: 'my-strategy',
    insert(selection, glyphId, cursor) {
        // Custom insert logic
        return { selection: [...selection, glyphId], cursor: null };
    },
    remove(selection, cursor) {
        // Custom remove logic
        return { selection: selection.slice(0, -1), cursor: null };
    },
    clear() {
        return { selection: [], cursor: null };
    },
};

<GlyphCanvasInput
    insertionStrategy={myStrategy}
    // ...
/>
```

### Custom Glyph Rendering

The keyboard uses a custom renderer for glyph display. The canvas renders glyphs via SVG foreignObject for maximum flexibility.

## Form Submission

The component maintains form compatibility:
- Hidden `<input>` with JSON-encoded selection
- SmartForm ref access to current value
- Proper field state management (touched, changed, empty)
