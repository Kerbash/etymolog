# GlyphCanvasInput Component

A comprehensive form input component for selecting and displaying ordered glyph sequences with support for multiple writing directions, infinite pan/zoom canvas, virtual IPA glyph fallbacks, and keyboard overlay for glyph selection.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Component Structure](#component-structure)
- [Core Concepts](#core-concepts)
  - [Infinite Canvas System](#infinite-canvas-system)
  - [Writing Directions](#writing-directions)
  - [Virtual Glyph System](#virtual-glyph-system)
  - [Insertion Strategies](#insertion-strategies)
  - [Blocks](#blocks)
- [API Reference](#api-reference)
- [Styling Guide](#styling-guide)
- [Modification Guide](#modification-guide)
- [Performance](#performance)
- [Troubleshooting](#troubleshooting)

---

## Features

### 🖼️ Infinite Pan/Zoom Canvas
- **Fixed viewport** with infinite internal content space
- Pan and zoom controls with mouse wheel, pinch gestures, and touch support
- Never affects parent container dimensions regardless of glyph count
- Reset and center view controls

### 📝 Multiple Writing Directions
- **LTR** (Left-to-Right): Latin, Greek, Cyrillic
- **RTL** (Right-to-Left): Arabic, Hebrew
- **TTB** (Top-to-Bottom): Traditional Chinese, Japanese
- **BTT** (Bottom-to-Top): Specialized scripts
- **Custom**: User-defined layout algorithms

### ⌨️ Dual-Mode Keyboard Overlay
- **Glyphs Mode**: Database glyphs with category grouping and search
- **IPA Mode**: Complete IPA character set for phonetic input
- Bottom-pinned overlay with smooth transitions
- Searchable with real-time filtering

### 🔤 Virtual Glyph System
- Auto-generates SVG placeholders for unmapped IPA characters
- Deterministic negative IDs for consistency
- Visual distinction with dashed borders
- Seamless integration with real glyphs

### 📋 SmartForm Integration
- Full form field registration support
- Hidden input for form submission
- Validation and state management
- Ref-based value access

### 🎨 Themeable & Accessible
- CSS custom properties for theming
- ARIA labels and keyboard navigation
- Focus management
- Screen reader support

---

## Architecture

### Directory Structure

```
glyphCanvasInput/
├── GlyphCanvasInput.tsx           # Main orchestrator component
├── GlyphCanvas.tsx                # Canvas display with pan/zoom
├── GlyphKeyboardOverlay.tsx       # Glyph/IPA selection keyboard
├── BlockPreviewStrip.tsx          # Block script: the composed word above the tiles
├── BlockPopover.tsx               # Block script: per-block forms / split / join
├── types.ts                       # TypeScript type definitions
├── strategies.ts                  # Insertion/removal strategies
│
├── utils/
│   ├── index.ts                   # Utility exports
│   ├── layoutUtils.ts             # Glyph positioning calculations
│   ├── graphemeUtils.ts           # Grapheme normalization
│   ├── virtualGlyphUtils.ts       # Virtual glyph generation (IPA, space, boundary)
│   ├── selectionModel.ts          # The entry list + pins, pin-carrying strategy ops
│   └── blockUtils.ts              # Entries → blocks (segmentEntries), popover model
│
├── GlyphCanvasInput.module.scss   # Main component styles
├── GlyphCanvas.module.scss        # Canvas styles (incl. outlines, boundary tile, pin dot)
├── GlyphKeyboardOverlay.module.scss # Keyboard styles (incl. the Boundary key)
├── BlockPreviewStrip.module.scss
├── BlockPopover.module.scss
└── README.md                      # This file
```

### Component Hierarchy

```
GlyphCanvasInput (form field container)
  ├── Header (label, glyph count, actions)
  │   ├── Label
  │   ├── Glyph Count Badge
  │   └── Keyboard Toggle Button
  │
  ├── GlyphCanvas (infinite canvas)
  │   ├── Canvas Container (fixed viewport)
  │   │   └── Canvas Wrapper (absolute, isolates content)
  │   │       └── TransformWrapper (react-zoom-pan-pinch)
  │   │           ├── TransformComponent
  │   │           │   └── SVG (dynamic size)
  │   │           │       └── Glyph Nodes (positioned)
  │   │           └── Zoom Controls
  │   │
  │   └── Empty State (when no glyphs)
  │
  ├── Auto-Spell Preview (optional)
  │
  ├── Virtual Glyph Warning (when present)
  │
  └── GlyphKeyboardOverlay (bottom sheet)
      ├── Header (mode toggle, search, actions)
      ├── Content (scrollable glyph grid)
      └── Footer (action buttons)
```

---

## Quick Start

### Basic Usage

```tsx
import { GlyphCanvasInput } from '@/components/form/customInput/glyphCanvasInput';
import { useSmartForm } from 'smart-form';

function MyForm() {
    const { registerField } = useSmartForm();
    const spellingField = registerField('spelling', {
        defaultValue: [],
        validators: [/* validators */],
    });

    return (
        <GlyphCanvasInput
            {...spellingField}
            availableGlyphs={glyphs}
            direction="ltr"
            label="Word Spelling"
        />
    );
}
```

### With IPA Mode & Auto-Spell

Auto-spell is a TOGGLE (the wand in the header), and while it is on the
software owns the spelling: pass the derived spelling as `locked` and the canvas
shows it read-only, greyed, with the notice on screen and every editing control
disabled. A spelling written by the lock is not a user edit (it never dirties
the form).

```tsx
function LexiconForm() {
    const [autoSpell, setAutoSpell] = useState(true);
    const derived = autoSpell ? deriveSpelling(pronunciation) : null; // SpellingEntry[] | null

    return (
        <GlyphCanvasInput
            {...spellingField}
            availableGlyphs={graphemes}
            enableIpaMode={true}
            autoSpell={{ enabled: autoSpell, onToggle: setAutoSpell }}
            locked={autoSpell ? {
                glyphOrder: derived,   // null = nothing to derive yet; the canvas keeps its spelling
                message: 'Auto-spell is on: this spelling is generated from the pronunciation…',
                tooltip: 'Disable auto-spell to modify the spelling',
            } : null}
        />
    );
}
```

`LexiconFormFields` is the reference consumer: it derives with the same speller
`lexicon.create` / `lexicon.update` use on save, so the canvas shows exactly what
will be stored.

---

## Component Structure

### GlyphCanvasInput.tsx

**Role:** Main component that orchestrates canvas, keyboard, and form integration.

**Key Responsibilities:**
- Form field registration and state management
- Keyboard overlay visibility control
- Selection management (add, remove, clear)
- Virtual glyph detection and warnings
- Auto-spell preview display
- Ref method exposure

**State Management:**
```tsx
const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
// One state: entry ids + the pinned variant of each (see "Blocks" → pins)
const [selection, setSelection] = useState<CanvasSelection>(initialSelection);
const transformRef = useRef<GlyphCanvasRef>(null);
```

### GlyphCanvas.tsx

**Role:** Display-only canvas with pan/zoom capabilities.

**Key Responsibilities:**
- Glyph layout calculation
- SVG rendering with absolute positioning
- Pan/zoom control via `react-zoom-pan-pinch`
- Infinite canvas isolation from parent layout
- Virtual glyph visual distinction

**Infinite Canvas Architecture:**
```tsx
// Fixed viewport - defines visible area
<div className="canvasContainer" style={{ minHeight: '120px' }}>

    // Absolute wrapper - isolates content
    <div className="canvasWrapper" style={{ position: 'absolute', inset: 0 }}>

        // Pan/zoom wrapper
        <TransformWrapper>
            <TransformComponent
                wrapperStyle={{ width: '100%', height: '100%' }}
                contentStyle={{
                    width: svgWidth,    // Expands with glyphs
                    height: svgHeight,  // Dynamic sizing
                }}
            >
                <svg width={svgWidth} height={svgHeight}>
                    {/* Glyphs positioned absolutely */}
                </svg>
            </TransformComponent>
        </TransformWrapper>
    </div>
</div>
```

**Why This Works:**
1. `.canvasContainer` has `position: relative` and `minHeight` - defines viewport
2. `.canvasWrapper` has `position: absolute; inset: 0` - fills container, isolates content
3. SVG can be any size (e.g., 2000px wide for 30 glyphs) - doesn't affect parent
4. `overflow: hidden` on wrapper clips excess, pan/zoom reveals it

### GlyphKeyboardOverlay.tsx

**Role:** Bottom-sheet keyboard for glyph/IPA selection.

**Key Responsibilities:**
- Dual mode (Glyphs/IPA) switching
- Category-based glyph organization
- Search/filter functionality
- Selection callbacks
- Remove/Clear actions

**Mode Management:**
```tsx
const [mode, setMode] = useState<KeyboardMode>('glyphs');

// Glyphs mode: Show real glyphs from database
const displayGlyphs = mode === 'glyphs'
    ? availableGlyphs
    : IPA_CHARACTERS.map(char => createVirtualGlyph(char));
```

---

## Core Concepts

### Infinite Canvas System

The canvas uses an **absolute positioning isolation pattern** to create a truly infinite internal space:

#### Problem It Solves
Without proper isolation, adding 15+ glyphs would cause:
- SVG width to grow (e.g., 880px for 15 glyphs)
- Parent container to expand
- Form layout to break
- Unwanted horizontal scrolling

#### Solution Architecture

**CSS Implementation:**

```scss
// GlyphCanvas.module.scss

.canvasContainer {
    position: relative;          // Reference for absolute children
    width: 100%;                 // Respects parent width
    overflow: hidden;            // Clips excess content
    min-width: 0;                // Prevents flex expansion
    max-width: 100%;             // Enforces constraint
}

.canvasWrapper {
    position: absolute;          // Removes from layout flow
    inset: 0;                    // Fills container
    overflow: hidden;            // Clips content
}
```

**Component Implementation:**

```tsx
// GlyphCanvas.tsx

// Calculate SVG dimensions based on glyph positions
const bounds = calculateBounds(positionedGlyphs, layout);
const svgWidth = Math.max(bounds.width, 200);   // Can be 2000px+
const svgHeight = Math.max(bounds.height, 80);

// Wrapper isolates the expanding content
<div className={styles.canvasContainer} style={{ minHeight: '120px' }}>
    <div className={styles.canvasWrapper}>
        <TransformWrapper>
            <TransformComponent
                contentStyle={{
                    width: svgWidth,    // Dynamic, can be huge
                    height: svgHeight,  // Doesn't affect parent!
                }}
            >
                <svg width={svgWidth} height={svgHeight}>
                    {/* Glyphs positioned at calculated coordinates */}
                </svg>
            </TransformComponent>
        </TransformWrapper>
    </div>
</div>
```

#### Mathematical Layout

For LTR direction with default config:
- Glyph width: 48px
- Glyph spacing: 8px
- Canvas padding: 16px

```
Glyph N position = padding + N * (width + spacing)
Total width = 16 + (count * 56) + 16

Examples:
- 5 glyphs:  328px
- 15 glyphs: 880px
- 30 glyphs: 1712px
```

The canvas **always stays 100% of parent width** while the internal SVG grows infinitely.

---

### Writing Directions

Layout strategies determine how glyphs are positioned on the canvas.

#### LTR (Left-to-Right)

```
[G1] [G2] [G3] [G4] →
```

**Implementation:**
```tsx
function calculateLtrLayout(glyphs, config) {
    return glyphs.map((glyph, index) => ({
        glyph,
        x: padding + index * (glyphWidth + spacing),
        y: padding,
        width: glyphWidth,
        height: glyphHeight,
        index,
    }));
}
```

**Used by:** Latin, Greek, Cyrillic, most modern scripts

#### RTL (Right-to-Left)

```
← [G4] [G3] [G2] [G1]
```

**Implementation:**
```tsx
function calculateRtlLayout(glyphs, config) {
    const totalWidth = glyphs.length * glyphWidth + (glyphs.length - 1) * spacing;
    const startX = padding + totalWidth - glyphWidth;

    return glyphs.map((glyph, index) => ({
        glyph,
        x: startX - index * (glyphWidth + spacing),
        y: padding,
        width: glyphWidth,
        height: glyphHeight,
        index,
    }));
}
```

**Used by:** Arabic, Hebrew, Persian

#### TTB (Top-to-Bottom)

```
[G1]
 ↓
[G2]
 ↓
[G3]
```

**Implementation:**
```tsx
function calculateTtbLayout(glyphs, config) {
    return glyphs.map((glyph, index) => ({
        glyph,
        x: padding,
        y: padding + index * (glyphHeight + spacing),
        width: glyphWidth,
        height: glyphHeight,
        index,
    }));
}
```

**Used by:** Traditional Chinese, Japanese (vertical writing)

#### BTT (Bottom-to-Top)

```
[G3]
 ↑
[G2]
 ↑
[G1]
```

**Used by:** Specialized scripts, decorative text

#### Custom Layout

Implement your own positioning algorithm:

```tsx
const spiralLayout: CanvasLayoutConfig = {
    direction: 'custom',
    customLayout: (glyphs, config) => {
        const positions: CanvasGlyph[] = [];
        let x = 0, y = 0;
        let direction = 0; // 0=right, 1=down, 2=left, 3=up
        let steps = 1, stepsTaken = 0, turnsAtLength = 0;

        glyphs.forEach((glyph, index) => {
            positions.push({
                glyph,
                x: config.canvasPadding + x * (config.glyphWidth + config.glyphSpacing),
                y: config.canvasPadding + y * (config.glyphHeight + config.glyphSpacing),
                width: config.glyphWidth,
                height: config.glyphHeight,
                index,
            });

            // Update position for spiral pattern
            const dx = [1, 0, -1, 0][direction];
            const dy = [0, 1, 0, -1][direction];
            x += dx;
            y += dy;
            stepsTaken++;

            if (stepsTaken === steps) {
                stepsTaken = 0;
                direction = (direction + 1) % 4;
                turnsAtLength++;
                if (turnsAtLength === 2) {
                    turnsAtLength = 0;
                    steps++;
                }
            }
        });

        return positions;
    },
};

<GlyphCanvasInput
    canvasLayout={spiralLayout}
    // ...
/>
```

---

### Virtual Glyph System

Virtual glyphs are **auto-generated SVG placeholders** for IPA characters that don't have corresponding graphemes in the database.

#### When Virtual Glyphs Are Created

1. **Auto-Spell Fallback**: When `generateSpellingWithFallback()` can't map all phonemes
2. **IPA Keyboard Selection**: User explicitly selects IPA characters
3. **Manual Creation**: Programmatically via `createVirtualGlyph()`

#### Virtual Glyph Characteristics

**ID Generation:**
```tsx
// Deterministic hash from IPA character
function generateVirtualId(ipaChar: string): number {
    let hash = 0;
    for (let i = 0; i < ipaChar.length; i++) {
        const char = ipaChar.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // 32-bit integer
    }
    return hash < 0 ? hash : -hash - 1; // Always negative
}

// Example: 'ə' → -1234567 (always the same)
```

**SVG Generation:**
```tsx
function generateVirtualSvg(ipaChar: string): string {
    const escaped = escapeXml(ipaChar);
    return `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
            <rect x="5" y="5" width="90" height="90"
                  fill="none" stroke="currentColor"
                  stroke-width="2" stroke-dasharray="5,5" rx="8"/>
            <text x="50" y="60" font-size="48"
                  text-anchor="middle" fill="currentColor">
                ${escaped}
            </text>
        </svg>
    `;
}
```

**Visual Styling:**
```scss
// GlyphCanvas.module.scss

.virtualGlyph {
    opacity: 0.9;
}

.virtualBackground {
    fill: var(--surface-base);
    stroke: var(--status-warning, #f59e0b);
    stroke-width: 1.5;
    stroke-dasharray: 3, 3;  // Dashed border
}
```

#### Working with Virtual Glyphs

**Detection:**
```tsx
import { isVirtualGlyphId } from './utils';

function processGlyphs(glyphIds: number[]) {
    glyphIds.forEach(id => {
        if (isVirtualGlyphId(id)) {
            console.log('Virtual glyph detected:', id);
            // Handle differently (e.g., warning, special processing)
        }
    });
}
```

**Manual Creation:**
```tsx
import { createVirtualGlyph } from './utils/virtualGlyphUtils';

// Create for schwa vowel
const schwaGlyph = createVirtualGlyph('ə', 'Mid central vowel');

// Add to glyph map
glyphMap.set(schwaGlyph.id, schwaGlyph);
```

**Saving to Database:**
Virtual glyphs are **NOT saved to the database**. Instead:
1. Store the spelling as mixed grapheme IDs and IPA characters
2. Use `glyph_order` format: `["grapheme-123", "ə", "grapheme-456"]`
3. Reconstruct virtual glyphs on load

```tsx
// Saving
const glyphOrder = selectedIds.map(id => {
    if (isVirtualGlyphId(id)) {
        const glyph = glyphMap.get(id);
        return glyph.ipaCharacter; // Store IPA char
    }
    return `grapheme-${id}`;      // Store grapheme ref
});

// Loading
const reconstructedIds = glyphOrder.map(entry => {
    if (entry.startsWith('grapheme-')) {
        return parseInt(entry.replace('grapheme-', ''));
    }
    // It's an IPA character
    const virtualGlyph = createVirtualGlyph(entry);
    glyphMap.set(virtualGlyph.id, virtualGlyph);
    return virtualGlyph.id;
});
```

#### Virtual Glyph Warning UI

When virtual glyphs are present, a warning is shown:

```tsx
{hasVirtualGlyphs && (
    <div className={styles.virtualWarning}>
        <i className="icon-info-circle" />
        <span>
            This spelling contains IPA fallback characters.
            Consider creating graphemes for these sounds.
        </span>
    </div>
)}
```

---

### Insertion Strategies

Strategies define how glyphs are added/removed from the selection.

#### Built-in Strategy: Append

```tsx
// strategies.ts

export const appendStrategy: InsertionStrategy = {
    name: 'append',

    insert(currentSelection, glyphId, cursor) {
        return {
            selection: [...currentSelection, glyphId],
            cursor: null, // No cursor in append mode
        };
    },

    remove(currentSelection, cursor) {
        if (currentSelection.length === 0) return { selection: [], cursor: null };
        return {
            selection: currentSelection.slice(0, -1), // Remove last
            cursor: null,
        };
    },

    clear() {
        return { selection: [], cursor: null };
    },
};
```

#### Custom Strategy: Insert at Cursor

```tsx
const insertAtCursorStrategy: InsertionStrategy = {
    name: 'insert-at-cursor',

    insert(currentSelection, glyphId, cursor) {
        if (cursor === null) {
            // No cursor, append to end
            return {
                selection: [...currentSelection, glyphId],
                cursor: currentSelection.length,
            };
        }

        // Insert at cursor position
        const before = currentSelection.slice(0, cursor);
        const after = currentSelection.slice(cursor);

        return {
            selection: [...before, glyphId, ...after],
            cursor: cursor + 1, // Move cursor forward
        };
    },

    remove(currentSelection, cursor) {
        if (currentSelection.length === 0) {
            return { selection: [], cursor: null };
        }

        if (cursor === null || cursor >= currentSelection.length) {
            // Remove from end
            return {
                selection: currentSelection.slice(0, -1),
                cursor: currentSelection.length - 2,
            };
        }

        // Remove at cursor
        const before = currentSelection.slice(0, cursor);
        const after = currentSelection.slice(cursor + 1);

        return {
            selection: [...before, ...after],
            cursor: Math.max(0, cursor - 1),
        };
    },

    clear() {
        return { selection: [], cursor: null };
    },
};

// Usage
<GlyphCanvasInput
    insertionStrategy={insertAtCursorStrategy}
    // ...
/>
```

#### Strategy Use Cases

| Strategy | Use Case |
|----------|----------|
| **Append** (default) | Simple sequential input, no editing |
| **Insert at Cursor** | Word processing, mid-spelling edits |
| **Rule-based** | Phonotactic constraints, syllable structure |
| **Template** | Fixed slots, fill-in-the-blank patterns |

### Blocks

Block script (see `apps/etymolog/BLOCK_SCRIPT_PLAN.md`, Phase 6). Everything in
this section is **off unless the script's block scheme is enabled**: the canvas
reads the scheme and the grapheme index from `EtymologProvider` through
`useOptionalBlockScheme()` / `useOptionalGraphemeMap()` (both `null` outside a
provider), so no prop is threaded through `LexiconFormFields` and the canvas
still mounts anywhere. With the scheme off (or no provider) none of the block
UI mounts and a stored `.` renders as the ordinary IPA text tile, exactly as
the display does with the scheme off.

The canvas stays **entry-based**: one tile per `glyph_order` entry. Cursor,
insert, backspace and clear behave exactly as without blocks.

#### Outlines

The canvas' current entries (built with `glyphOrderToDisplayEntries`, 1:1 with
the tiles, resolved against the provider's grapheme map) are segmented with the
engine's own `segmentEntries`. Every `block` segment gets a thin outline around
its tiles' cells, coloured with the template's **first role's** `colour`
(`var(--interactive-base)` when it has none), and a caption in a band above the
tiles: the template name and a **Block…** button (the outline is clickable too).
`single` / `passthrough` entries get no outline. Outlines speak *selection
positions*, so an id missing from the glyph map never shifts them onto the wrong
tiles (such a block is simply not outlined).

#### Preview strip

`BlockPreviewStrip` renders the current entries with the real
`GlyphSpellingDisplay` (scheme and grapheme map from context) under the line
"This is how the word renders everywhere else" — the composed blocks, slot
variants, pins and boundaries, exactly as a card or the translator draws them.
It is hidden when the scheme is off and stays visible under the auto-spell lock.

#### Boundaries

The explicit block break is the IPA syllable separator `.` (`BLOCK_BOUNDARY`).
It is a real entry, a virtual glyph like the space:
`createBoundaryGlyph()` / `isBoundaryGlyphName()` / `BOUNDARY_CHARACTER` in
`utils/virtualGlyphUtils.ts`.

```
keyboard "· Boundary" key ─┐
physical "." key ──────────┼─► handleSelect(BOUNDARY_GLYPH) ─► strategy.insert (at the cursor)
popover "Split before X" ──┘   (split: insertAt(entryIndex))
        │
        ▼
selection.ids gets the boundary's (negative) virtual id; the glyph is registered
in the virtual-glyph map, so buildGlyphOrder serialises it as "."
        │
        ▼
glyph_order  ["grapheme-1", "grapheme-2", ".", "grapheme-3"]
        │
        ▼
canvas: a slim dashed bar with a "·" mark (tooltip "Block boundary"), never a
text glyph; segmentEntries consumes it as a block break.
```

- The "·" **Boundary** key is shown only while the scheme is on. The shared
  keyboard has no slot for extra keys, so it sits in its own row directly under
  the Space / Backspace row.
- The physical `.` key works while the keyboard is open (the same condition as
  the physical Space), not while typing in the search box, not on key repeat
  and not with Ctrl / Alt / Meta. Unlike Space it is allowed while a key button
  has focus — `.` does not activate a button, so there is no double insert.
- The auto-speller emits `.` for a `ka.ta` pronunciation, so a derived spelling
  shown under the lock gets boundary tiles too.
- While blocks are on, a boundary does not count as an "IPA fallback" for the
  header's "(includes IPA)" hint and the IPA notice (it is not drawn as a dashed
  IPA tile). The `onSelectionChange` `hasVirtualGlyphs` flag is unchanged.
- **Join** (`‿`, `BLOCK_JOIN`) is the mirror of the boundary: it keeps the signs
  on both sides in ONE block (`createJoinGlyph()` / `isJoinGlyphName()` /
  `JOIN_CHARACTER`). The "‿ Join" key sits right after Boundary, under the same
  rule (only while the scheme is on; `onJoin`), and goes through
  `handleSelect(JOIN_GLYPH)` like the Boundary key. It has no physical key.
  The canvas draws it as a slim SOLID bar with a "‿" mark (tooltip "Block
  join", `data-join="true"`); like the boundary it is not an "IPA fallback"
  while blocks are on.

#### Pins in the selection model

A pinned variant (`grapheme-12@34`) belongs to ONE entry. The selection is one
state, `CanvasSelection = { ids: number[]; pins: (number | null)[] }`
(`utils/selectionModel.ts`), with `pins` aligned to `ids` by position:

```
ids:  [ 12,   5,  -9 ]   →  glyph_order ["grapheme-12@34", "grapheme-5", "a"]
pins: [ 34, null, null ]
```

A parallel array rather than `{ id, variantId }` items keeps the insertion
strategies (typed over `number[]`, including any custom one a caller passes)
**untouched**. `insertWithStrategy` / `removeWithStrategy` run the strategy on
the real ids AND a second time on position tokens, so every pin follows its own
entry — even between identical graphemes (`[k@7, k]` under a front-removing
strategy loses the right `k`). A strategy that inspects ids and so disagrees
with the token run falls back to keeping pins only on the provable common
prefix/suffix, never guessing. `setPinAt` always produces a new `ids` identity,
so the change effect (keyed on the whole selection) fires for a pin-only edit.

- **In**: `initialGlyphOrder`, `setGlyphOrder` and the auto-spell lock all go
  through one parser (`parseOrderToSelection`), which keeps `variantId`.
- **Out**: `buildGlyphOrder` → `createGraphemeEntry(id, pin)`; the imperative
  `glyphOrder` getter, `onSelectionChange`'s `glyphOrder` and the hidden input
  all carry the pin. `value` (number[]) and `setValue(number[])` cannot carry
  pins; entries set through `setValue` are unpinned.
- A pinned tile draws the pinned form and shows a small dot. This is
  independent of the scheme (a pin is part of the stored spelling and the
  display honours it on the non-block path too), so a pinned spelling
  round-trips unchanged with the scheme on or off.

The hidden input's `value` is rendered from the same glyph order
(`serializeGlyphOrder`), not written into the DOM from the change effect: the
input is React-controlled, so the re-render that effect triggers used to reset a
DOM write back to the bare id list.

#### Block popover

`BlockPopover` (the app's `<Modal>` + `<DialogPanel>`, portalled out of the
form, so its controls are never SmartForm fields) shows the template name and,
per slot in pattern order: the role label, the sign, and a variant `<select>` —
"Auto (<slot group name>)" or "Auto (default form)" first, then every variant
of the grapheme. Choosing a variant pins it on that entry; **Auto** strips the
pin. IPA entries in a slot have no forms. "Split before <role>" (every slot but
the first) inserts a `.` before that slot's entry; "Join with next block"
(offered only when a `.` directly follows the block) removes it. Split / Join
close the popover, since the block they were opened on no longer exists.

#### Under the auto-spell lock

The outlines, captions and preview strip still show (pins are a manual-spelling
thing: `deriveAutoSpelledGlyphOrder` never emits them — plan P11). The popover
still opens but is **read-only**: every select and button is disabled and the
lock's own text (`locked.tooltip`, "Disable auto-spell to modify the spelling"
in the lexicon form) is shown on screen. The handlers refuse under the lock as
well, so no path writes a pin into a software-owned spelling.

---

## API Reference

### GlyphCanvasInputProps

```tsx
interface GlyphCanvasInputProps extends registerFieldReturnType {
    // === Required Props ===

    // SmartForm Integration (spread from registerField return)
    registerSmartFieldProps: {
        name: string;
        onBlur: () => void;
        onChange: (value: number[]) => void;
        // ...
    };
    fieldState: {
        value: number[];
        touched: boolean;
        changed: boolean;
        // ...
    };

    // === Data Props ===

    /** Available glyphs for selection (optional for backwards-compat) */
    availableGlyphs?: GlyphWithUsage[];

    /** Default selected glyph IDs */
    defaultValue?: number[];

    // === Layout Props ===

    /** Writing direction (default: 'ltr') */
    direction?: WritingDirection;

    /** Canvas layout configuration */
    canvasLayout?: Partial<CanvasLayoutConfig>;

    // === Behavior Props ===

    /** Custom insertion strategy (default: append) */
    insertionStrategy?: InsertionStrategy;

    /** Enable keyboard search (default: true) */
    searchable?: boolean;

    /** Keyboard overlay height (default: '260px') */
    keyboardHeight?: string;

    // === UI Props ===

    /** Field label (default: 'Glyph Sequence') */
    label?: string;

    /** Additional class name */
    className?: string;

    /** Additional inline styles */
    style?: CSSProperties;

    // === Callback Props ===

    /** Called when selection changes */
    onSelectionChange?: (ids: number[]) => void;

    /** The wand: an on/off toggle for the word's auto-spell flag. Omit to hide it. */
    autoSpell?: { enabled: boolean; onToggle: (next: boolean) => void; disabledReason?: string | null };

    /** Software-owned spelling: shown read-only while set (see "With IPA Mode & Auto-Spell"). */
    locked?: { glyphOrder: SpellingEntry[] | null; message: string; tooltip: string } | null;
}
```

### CanvasLayoutConfig

```tsx
interface CanvasLayoutConfig {
    /** Writing direction */
    direction: WritingDirection;

    /** Spacing between glyphs (px) */
    glyphSpacing: number;

    /** Uniform glyph box width (px) */
    glyphWidth: number;

    /** Uniform glyph box height (px) */
    glyphHeight: number;

    /** Padding around canvas content (px) */
    canvasPadding: number;

    /** Custom layout function (used when direction='custom') */
    customLayout?: (
        glyphs: Glyph[],
        config: Omit<CanvasLayoutConfig, 'customLayout'>
    ) => CanvasGlyph[];
}

// Default values
const DEFAULT_LAYOUT_CONFIG = {
    direction: 'ltr',
    glyphSpacing: 8,
    glyphWidth: 48,
    glyphHeight: 48,
    canvasPadding: 16,
};
```

### GlyphCanvasInputRef

Methods exposed via `ref`:

```tsx
interface GlyphCanvasInputRef {
    /** Current selected glyph IDs */
    readonly value: number[];

    /** Reset the canvas view (zoom and pan) */
    resetCanvasView: () => void;

    /** Fit canvas content to view */
    fitCanvasToView: () => void;

    /** Open the keyboard overlay */
    openKeyboard: () => void;

    /** Close the keyboard overlay */
    closeKeyboard: () => void;

    /** Clear all selected glyphs */
    clear: () => void;

    /** Set selection programmatically */
    setValue: (ids: number[]) => void;
}

// Usage
const inputRef = useRef<GlyphCanvasInputRef>(null);

useEffect(() => {
    // Access current value
    console.log('Current:', inputRef.current?.value);

    // Control programmatically
    inputRef.current?.setValue([1, 2, 3]);
    inputRef.current?.fitCanvasToView();
}, []);
```

### VirtualGlyph Interface

```tsx
interface VirtualGlyph {
    /** Negative ID generated from IPA character hash */
    id: number;

    /** The IPA character this virtual glyph represents */
    ipaCharacter: string;

    /** Display name (typically the IPA character itself) */
    name: string;

    /** Generated SVG data showing the IPA character */
    svg_data: string;

    /** Always 'IPA Fallback' for virtual glyphs */
    category: string;

    /** Optional notes/description */
    notes: string | null;

    /** Source discriminator - always 'virtual-ipa' */
    source: 'virtual-ipa';
}
```

---

## Styling Guide

### CSS Custom Properties

The component uses CSS custom properties for theming. Define these in your global theme:

```css
:root {
    /* Surfaces */
    --surface-base: #ffffff;
    --surface-raised: #f5f5f5;
    --surface-raised-hover: #e5e5e5;

    /* Borders */
    --border-primary: #d4d4d8;
    --border-secondary: #a1a1aa;

    /* Text */
    --text-primary: #18181b;
    --text-secondary: #71717a;

    /* Interactive */
    --interactive-base: #3b82f6;
    --interactive-hover: #2563eb;

    /* Status */
    --status-info: #3b82f6;
    --status-warning: #f59e0b;
    --status-good: #10b981;
    --status-bad: #ef4444;

    /* Focus */
    --focus-ring: #3b82f6;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
    :root {
        --surface-base: #18181b;
        --surface-raised: #27272a;
        --text-primary: #fafafa;
        --text-secondary: #a1a1aa;
        /* ... */
    }
}
```

### Component-Specific Styles

#### Canvas Container

```scss
// Override canvas container dimensions
.customCanvas {
    :global(.canvasContainer) {
        min-height: 200px;       // Taller viewport
        border-radius: 12px;     // Rounder corners
        border: 3px solid var(--interactive-base);
    }
}

<GlyphCanvasInput className="customCanvas" />
```

#### Virtual Glyph Appearance

```scss
// Custom virtual glyph styling
.customCanvas {
    :global(.virtualBackground) {
        stroke: #ff6b6b;          // Red border
        stroke-dasharray: 5, 2;   // Different dash pattern
        fill: rgba(255, 107, 107, 0.05);
    }

    :global(.virtualContent) {
        font-family: 'Noto Sans', sans-serif;
        color: #ff6b6b;
    }
}
```

#### Keyboard Overlay

```scss
// Adjust keyboard height
.tallKeyboard {
    :global(.keyboardOverlay) {
        height: 400px;  // Taller keyboard
    }
}

<GlyphCanvasInput keyboardHeight="400px" />
```

### Glyph SVG Styling

Glyphs are rendered inside `foreignObject`, so you can style the SVG content:

```scss
.customCanvas {
    :global(.glyphContent svg) {
        filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
    }

    :global(.glyphBackground) {
        fill: var(--surface-raised);
        stroke: var(--border-primary);

        &:hover {
            fill: var(--interactive-hover);
        }
    }
}
```

---

## Modification Guide

### Adding a New Layout Strategy

**Step 1:** Implement the layout function in `layoutUtils.ts`:

```tsx
// layoutUtils.ts

/**
 * Grid layout - arranges glyphs in a grid pattern
 */
function calculateGridLayout(
    glyphs: GlyphForLayout[],
    config: Required<Omit<CanvasLayoutConfig, 'customLayout'>>
): CanvasGlyph[] {
    const { glyphSpacing, glyphWidth, glyphHeight, canvasPadding } = config;
    const columns = 5; // 5 glyphs per row

    return glyphs.map((glyph, index) => {
        const row = Math.floor(index / columns);
        const col = index % columns;

        return {
            glyph: glyph as any,
            index,
            x: canvasPadding + col * (glyphWidth + glyphSpacing),
            y: canvasPadding + row * (glyphHeight + glyphSpacing),
            width: glyphWidth,
            height: glyphHeight,
        };
    });
}
```

**Step 2:** Add to the layout dispatcher:

```tsx
// layoutUtils.ts

export function calculateGlyphLayout(
    glyphs: GlyphForLayout[],
    config: Partial<CanvasLayoutConfig> = {}
): CanvasGlyph[] {
    const mergedConfig = mergeLayoutConfig(config);
    const { direction, customLayout } = mergedConfig;

    if (direction === 'custom' && customLayout) {
        return customLayout(glyphs as any, mergedConfig);
    }

    switch (direction) {
        case 'rtl':
            return calculateRtlLayout(glyphs, mergedConfig);
        case 'ttb':
            return calculateTtbLayout(glyphs, mergedConfig);
        case 'btt':
            return calculateBttLayout(glyphs, mergedConfig);
        case 'grid':  // ADD THIS
            return calculateGridLayout(glyphs, mergedConfig);
        case 'ltr':
        default:
            return calculateLtrLayout(glyphs, mergedConfig);
    }
}
```

**Step 3:** Update the `WritingDirection` type:

```tsx
// types.ts

export type WritingDirection =
    | 'ltr'
    | 'rtl'
    | 'ttb'
    | 'btt'
    | 'grid'    // ADD THIS
    | 'custom';
```

**Step 4:** Use it:

```tsx
<GlyphCanvasInput
    direction="grid"
    canvasLayout={{
        glyphWidth: 40,
        glyphHeight: 40,
        glyphSpacing: 8,
    }}
    // ...
/>
```

### Adding Custom Glyph Interactions

Currently, glyphs in the canvas are display-only. To add click handlers:

**Step 1:** Update `GlyphNode` component:

```tsx
// GlyphCanvas.tsx

function GlyphNode({
    positionedGlyph,
    onGlyphClick,  // ADD THIS PROP
}: {
    positionedGlyph: CanvasGlyph;
    onGlyphClick?: (glyph: CanvasGlyph) => void;
}) {
    const { glyph, x, y, width, height } = positionedGlyph;
    const isVirtual = isVirtualGlyphId(glyph.id);

    return (
        <g
            className={classNames(styles.glyphNode, {
                [styles.virtualGlyph]: isVirtual,
                [styles.clickable]: !!onGlyphClick,  // ADD CLICKABLE STATE
            })}
            transform={`translate(${x}, ${y})`}
            onClick={() => onGlyphClick?.(positionedGlyph)}  // ADD CLICK HANDLER
            style={{ cursor: onGlyphClick ? 'pointer' : 'default' }}
        >
            {/* ... existing rendering ... */}
        </g>
    );
}
```

**Step 2:** Pass callback from `GlyphCanvas`:

```tsx
// GlyphCanvas.tsx

export interface GlyphCanvasProps {
    // ... existing props ...
    onGlyphClick?: (glyph: CanvasGlyph) => void;  // ADD THIS
}

// In render:
{positionedGlyphs.map((pg) => (
    <GlyphNode
        key={`${pg.glyph.id}-${pg.index}`}
        positionedGlyph={pg}
        onGlyphClick={onGlyphClick}  // PASS IT DOWN
    />
))}
```

**Step 3:** Use it from `GlyphCanvasInput`:

```tsx
<GlyphCanvas
    ref={transformRef}
    selectedGlyphIds={selectedIds}
    glyphMap={glyphMap}
    layout={canvasLayout}
    onGlyphClick={(glyph) => {
        console.log('Glyph clicked:', glyph);
        // Handle click (e.g., remove glyph, show tooltip, etc.)
    }}
/>
```

### Customizing the Empty State

**Override the empty state content:**

```tsx
<GlyphCanvasInput
    {...field}
    availableGlyphs={glyphs}
    emptyStateContent={
        <div style={{ textAlign: 'center', padding: '2rem' }}>
            <img src="/empty-state.svg" alt="No glyphs" />
            <p>Start building your word!</p>
            <button onClick={() => inputRef.current?.openKeyboard()}>
                Add First Glyph
            </button>
        </div>
    }
/>
```

### Adding Keyboard Categories

**Step 1:** Modify category data in `GlyphKeyboardOverlay`:

```tsx
// GlyphKeyboardOverlay.tsx

// Group glyphs by category
const glyphsByCategory = useMemo(() => {
    const map = new Map<string, GlyphLike[]>();

    displayGlyphs.forEach(glyph => {
        const category = glyph.category || 'Uncategorized';
        if (!map.has(category)) {
            map.set(category, []);
        }
        map.get(category)!.push(glyph);
    });

    // Sort categories alphabetically, but keep 'Common' first
    return new Map(
        Array.from(map.entries()).sort((a, b) => {
            if (a[0] === 'Common') return -1;
            if (b[0] === 'Common') return 1;
            return a[0].localeCompare(b[0]);
        })
    );
}, [displayGlyphs]);
```

**Step 2:** Ensure glyphs have category data:

```tsx
// When fetching glyphs
const glyphs = await getGlyphsWithUsage();

// Add/update categories
const categorizedGlyphs = glyphs.map(glyph => ({
    ...glyph,
    category: glyph.category || inferCategory(glyph.name),
}));

function inferCategory(name: string): string {
    if (/^[aeiou]/i.test(name)) return 'Vowels';
    if (/^[bcdfg]/i.test(name)) return 'Consonants';
    return 'Other';
}
```

### Performance Optimization: Virtual Scrolling

For large glyph sets (1000+ glyphs), implement virtual scrolling in the keyboard:

```tsx
// Install react-window
// npm install react-window

import { FixedSizeGrid } from 'react-window';

function VirtualizedGlyphGrid({ glyphs, onSelect }: Props) {
    const columnCount = 5;
    const rowCount = Math.ceil(glyphs.length / columnCount);
    const cellWidth = 80;
    const cellHeight = 80;

    return (
        <FixedSizeGrid
            columnCount={columnCount}
            columnWidth={cellWidth}
            height={400}
            rowCount={rowCount}
            rowHeight={cellHeight}
            width={columnCount * cellWidth}
        >
            {({ columnIndex, rowIndex, style }) => {
                const index = rowIndex * columnCount + columnIndex;
                const glyph = glyphs[index];

                if (!glyph) return null;

                return (
                    <div style={style} onClick={() => onSelect(glyph)}>
                        <GlyphButton glyph={glyph} />
                    </div>
                );
            }}
        </FixedSizeGrid>
    );
}
```

---

## Performance

### Canvas Rendering

**Optimization: Memoization**

The canvas uses aggressive memoization to prevent unnecessary re-renders:

```tsx
// GlyphCanvas.tsx

// Memoize glyph lookup
const selectedGlyphs = useMemo(() => {
    return selectedGlyphIds
        .map(id => glyphMap.get(id))
        .filter((g): g is NonNullable<typeof g> => g !== undefined);
}, [selectedGlyphIds, glyphMap]);

// Memoize layout calculation
const positionedGlyphs = useMemo(() => {
    return calculateGlyphLayout(selectedGlyphs, layout);
}, [selectedGlyphs, layout]);

// Memoize bounds calculation
const bounds = useMemo(() => {
    return calculateBounds(positionedGlyphs, layout);
}, [positionedGlyphs, layout]);
```

**Result:** Re-renders only occur when:
- `selectedGlyphIds` changes (user adds/removes glyph)
- `glyphMap` changes (database update)
- `layout` config changes

### SVG Sanitization

DOMPurify sanitization is memoized per glyph:

```tsx
// GlyphNode component

const sanitizedSvg = useMemo(() => {
    return DOMPurify.sanitize(glyph.svg_data, {
        USE_PROFILES: { svg: true, svgFilters: true },
    });
}, [glyph.svg_data]);
```

**Benchmark:** 100 glyphs render in <50ms on modern hardware.

### Keyboard Filtering

Search filtering uses debounced input:

```tsx
// GlyphKeyboardOverlay.tsx

const [searchQuery, setSearchQuery] = useState('');
const [debouncedQuery, setDebouncedQuery] = useState('');

useEffect(() => {
    const timer = setTimeout(() => {
        setDebouncedQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
}, [searchQuery]);

// Filter using debounced query
const filteredGlyphs = useMemo(() => {
    if (!debouncedQuery) return displayGlyphs;
    return displayGlyphs.filter(g =>
        g.name.toLowerCase().includes(debouncedQuery.toLowerCase())
    );
}, [displayGlyphs, debouncedQuery]);
```

### Memory Management

Virtual glyphs are created once and cached:

```tsx
// GlyphCanvasInput.tsx

const [glyphMapWithVirtuals, setGlyphMapWithVirtuals] = useState(() =>
    new Map(availableGlyphs?.map(g => [g.id, g]))
);

// When adding virtual glyph, cache it
const handleIpaSelect = useCallback((ipaChar: string, virtualGlyph: VirtualGlyph) => {
    setGlyphMapWithVirtuals(prev => {
        const next = new Map(prev);
        if (!next.has(virtualGlyph.id)) {
            next.set(virtualGlyph.id, virtualGlyph as any);
        }
        return next;
    });

    handleAddGlyph(virtualGlyph.id);
}, [handleAddGlyph]);
```

---

## Troubleshooting

### Issue: Canvas Expands Parent Container

**Symptoms:** Adding many glyphs causes horizontal scrolling or form layout breaks.

**Cause:** Absolute positioning isolation not working.

**Fix:** Ensure CSS is correct:

```scss
// GlyphCanvas.module.scss

.canvasContainer {
    position: relative;
    width: 100%;
    overflow: hidden;
    min-width: 0;          // Critical for flex
    max-width: 100%;       // Critical for flex
}

.canvasWrapper {
    position: absolute;    // Critical - removes from layout
    inset: 0;
    overflow: hidden;
}
```

### Issue: Virtual Glyphs Not Showing

**Symptoms:** IPA characters selected but don't appear on canvas.

**Cause:** Virtual glyph not added to glyph map.

**Fix:**

```tsx
const handleIpaSelect = (ipaChar: string, virtualGlyph: VirtualGlyph) => {
    // Add to map FIRST
    setGlyphMapWithVirtuals(prev => {
        const next = new Map(prev);
        next.set(virtualGlyph.id, virtualGlyph as any);
        return next;
    });

    // Then add to selection
    handleAddGlyph(virtualGlyph.id);
};
```

### Issue: Pan/Zoom Not Working

**Symptoms:** Cannot pan or zoom the canvas.

**Cause:** `react-zoom-pan-pinch` not initialized correctly.

**Fix:** Check TransformWrapper configuration:

```tsx
<TransformWrapper
    ref={transformRef}
    initialScale={1}
    minScale={0.25}
    maxScale={3}
    centerOnInit           // Centers content on load
    doubleClick={{ disabled: false, mode: 'reset' }}
    wheel={{ disabled: false, step: 0.1 }}
    panning={{ velocityDisabled: false }}
    pinch={{ disabled: false }}
>
```

### Issue: Glyphs Overlapping

**Symptoms:** Glyphs render on top of each other.

**Cause:** Layout calculation returning same positions.

**Debug:**

```tsx
// Add logging in layoutUtils.ts

export function calculateGlyphLayout(...) {
    // ...
    const result = calculateLtrLayout(glyphs, mergedConfig);

    console.log('Layout result:', result.map(r => ({ id: r.glyph.id, x: r.x, y: r.y })));

    return result;
}
```

**Common Fix:** Check config values:

```tsx
const config = {
    glyphWidth: 48,
    glyphHeight: 48,
    glyphSpacing: 8,    // Must be > 0
    canvasPadding: 16,
};
```

### Issue: Form Not Submitting Values

**Symptoms:** Form submission doesn't include glyph selection.

**Cause:** Field not registered correctly or hidden input missing.

**Fix:**

```tsx
// Ensure proper registration
const spellingField = registerField('spelling', {
    defaultValue: [],
    validators: [/* ... */],
});

// Spread ALL props
<GlyphCanvasInput
    {...spellingField}  // Must spread entire object
    availableGlyphs={glyphs}
/>

// Check hidden input is present
<input
    type="hidden"
    name={name}
    value={JSON.stringify(value)}
/>
```

### Issue: Keyboard Not Closing on Mobile

**Symptoms:** Keyboard overlay stays open after selection on touch devices.

**Cause:** Touch event propagation.

**Fix:** Ensure proper event handling:

```tsx
// GlyphKeyboardOverlay.tsx

const handleGlyphClick = (glyph: GlyphLike) => {
    onSelect(glyph);

    // Close keyboard on mobile after selection
    if ('ontouchstart' in window) {
        setTimeout(() => onClose(), 100);
    }
};
```

---

## Migration Notes

### From Previous Version (SVG Concatenation)

If migrating from the old SVG concatenation pattern:

**Before:**
```tsx
const combinedSvg = glyphs.map(g => g.svg_data).join('');
<div dangerouslySetInnerHTML={{ __html: sanitizedSvg }} />
```

**After:**
```tsx
<GlyphCanvasInput
    {...field}
    availableGlyphs={glyphs}
    direction="ltr"
/>
```

**Benefits:**
- ✅ Proper positioning with configurable layouts
- ✅ Pan/zoom functionality
- ✅ Infinite canvas without parent expansion
- ✅ Virtual glyph support
- ✅ Form integration

---

## Related Components

- **GlyphSpellingDisplay**: Read-only display component for showing glyph sequences (in `src/components/display/spelling/`)
- **GlyphCard**: Individual glyph display card (in `src/components/display/glyphs/`)
- **CompactLexiconDisplay**: Uses GlyphSpellingDisplay for showing word spellings
- **DetailedLexiconDisplay**: Full word display with GlyphSpellingDisplay

---

## License & Contributing

This component is part of the Etymolog conlang documentation tool. For contributions, ensure:

1. TypeScript types are maintained
2. CSS modules are used for styling
3. Accessibility (ARIA labels, keyboard nav) is preserved
4. Performance optimizations are not broken
5. Tests are updated (if test suite exists)

---

**Questions or Issues?**

File issues on the project repository or contact the development team.
