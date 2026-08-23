﻿# GlyphSpellingDisplay
A unified component for rendering glyph sequences with flexible layout strategies. Supports both static display and interactive "simulated paper" mode with pan/zoom/viewport control.
## Features
- **Multiple Display Modes**: Static (default) and Interactive modes
- **Simulated Paper**: Pan, zoom, and viewport control for longer texts
- **Flexible Layout Strategies**: LTR, RTL, TTB, BTT, Block, Spiral, Circular, Boustrophedon
- **Canvas/Viewport Separation**: Set internal canvas size (for text wrapping) independently from viewport size
- **Programmatic Control**: Imperative API for zoom, pan, fit-to-view operations
- **Virtual Glyph Support**: Visual distinction for IPA fallback glyphs
- **Performance Optimized**: Memoized rendering with React.memo
- **Auto-sizing**: Automatically sizes viewport to accommodate full text (static mode)
- **Centered Display**: Text is centered both horizontally and vertically (static mode)
## Quick Start
### Static Mode (Default)
Simple, non-interactive display for small glyph sequences. Text is automatically centered and the viewport adjusts to fit the content:
```tsx
import { GlyphSpellingDisplay } from './components/display/spelling';
<GlyphSpellingDisplay
  glyphs={lexiconData.spellingDisplay}
  graphemeMap={graphemeMap}
  strategy="ltr"
  config="compact"
/>
```

**Note**: In static mode, the component automatically:
- Centers the text both horizontally and vertically
- Sets the container width/height to match the content bounds
- Uses flexbox for proper centering
### Interactive Mode (Simulated Paper)
Full pan/zoom/viewport control for longer texts:
```tsx
import { GlyphSpellingDisplay, GlyphSpellingDisplayRef } from './components/display/spelling';
const ref = useRef<GlyphSpellingDisplayRef>(null);
<GlyphSpellingDisplay
  ref={ref}
  glyphs={longText}
  mode="interactive"
  canvas={{ width: 800, showPaperEffect: true }}
  viewport={{ initialZoom: 1, minZoom: 0.5, maxZoom: 3 }}
  onTransformChange={(t) => console.log('Zoom:', t.scale)}
/>
// Programmatic control
ref.current?.fitToView();
ref.current?.setZoom(2);
ref.current?.panTo(100, 50);
```
### Static Interactive (Read-only with visuals)
Interactive appearance without user interactions:
```tsx
<GlyphSpellingDisplay
  glyphs={data}
  mode="interactive"
  disableInteraction
  showControls={false}
/>
```
## Props
### Data Input
| Prop | Type | Description |
|------|------|-------------|
| `glyphs` | `SpellingDisplayEntry[] \| Glyph[] \| GraphemeComplete[] \| number[]` | Glyph data (supports multiple formats) |
| `glyphMap` | `Map<number, Glyph>` | Required when glyphs is `number[]` |
| `graphemeMap` | `Map<number, GraphemeComplete>` | For resolving grapheme references |
### Layout
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `strategy` | `LayoutStrategyType` | `'ltr'` | Layout algorithm |
| `config` | `Partial<LayoutStrategyConfig> \| LayoutPreset` | - | Layout configuration or preset name |
### Display Mode
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `mode` | `'static' \| 'interactive'` | `'static'` | Display mode |
| `disableInteraction` | `boolean` | `false` | Disable all pan/zoom interactions |
| `showControls` | `boolean` | `true` | Show zoom control buttons |
| `onTransformChange` | `(transform: ViewportTransform) => void` | - | Callback when viewport changes |
### Canvas Configuration (Interactive Mode)
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `canvas.width` | `number` | Content width | Internal canvas width (enables text wrapping) |
| `canvas.height` | `number` | Content height | Internal canvas height |
| `canvas.backgroundColor` | `string` | see below | Canvas/paper colour override (a literal — it is serialised into exports as-is) |
| `canvas.showPaperEffect` | `boolean` | `false` | Paint an opaque paper rect with a shadow behind the glyphs |

The paper defaults to `var(--page-background-primary, white)` (`PAPER_FILL` in `GlyphSpellingCore`): the token follows the theme in the app, and the `white` fallback is what the SVG/PNG exporters — which serialise the element verbatim into a file with no app CSS — resolve to. Glyph ink is `currentColor`, so in-app it is `--text-primary` and in an export it is black on white.
### Viewport Configuration (Interactive Mode)
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `viewport.width` | `number \| string` | `'100%'` | Viewport width |
| `viewport.height` | `number \| string` | Content height | Viewport height |
| `viewport.initialZoom` | `number` | `1` | Initial zoom level |
| `viewport.minZoom` | `number` | `0.1` | Minimum zoom level |
| `viewport.maxZoom` | `number` | `5` | Maximum zoom level |
| `viewport.initialX` | `number` | `0` | Initial X position |
| `viewport.initialY` | `number` | `0` | Initial Y position |
### Rendering
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `emptyContent` | `ReactNode` | - | Content for empty state |
| `showVirtualGlyphStyling` | `boolean` | `true` | Show distinct styling for virtual IPA glyphs |
| `fit` | `'natural' \| 'shrink'` | `'natural'` | Static mode. `shrink`: natural size when it fits, scaled DOWN (never up) to the parent's width — and, in a bounded parent, height — when it does not. Pure CSS (`width: min(100%, natural)`), no measuring: every word renders at the same glyph size until one is too long for its box. Used by the lexicon card's glyph band. |

### Cell and margin — how letters are spaced

A glyph box is the whole drawing canvas. Its **cell** is the guide square in the middle — `cellFraction` of the box on each axis (`GLYPH_CELL_FRACTION` in `db/utils/glyphMetrics`, the same constant the drawing canvas paints its guide with). The cell is the space a letter *reserves*; the margin around it is space a letter may *reach into* but does not own.

Every strategy advances by the cell (`utils/cell.ts` — `stepX = cellWidth + spacing`), so consecutive boxes overlap by their margins and the cells abut: a tail or an accent drawn in the margin lands beside the next letter instead of pushing it away. Rows in `block`/`boustrophedon` advance by the cell too. Bounds stay box-based — the word's outer margins are part of its drawing and are never clipped.

`cellFraction` is a REQUIRED field of `LayoutStrategyConfig` so every hand-built config states its geometry; partial configs and presets are merged over `DEFAULT_LAYOUT_CONFIG` and get the app's cell. `cellFraction: 1` means boxes abut (no margins).

| Preset | Box | Spacing | Padding | For |
|--------|-----|---------|---------|-----|
| `compact` | 20 | 2 | 4 | Inline spellings |
| `detailed` | 40 | 6 | 12 | Detail pages |
| `tree` | 14 | 1 | 2 | Etymology tree |
| `input` | 48 | 8 | 16 | The glyph canvas input |
| `card` | 80 | 0 | 0 | The lexicon grid card's glyph band (with `fit="shrink"`) |
## Ref Methods
| Method | Description |
|--------|-------------|
| `resetView()` | Reset viewport to initial state |
| `fitToView()` | Fit all content in viewport |
| `setZoom(scale)` | Set zoom level programmatically |
| `panTo(x, y)` | Pan to specific coordinates |
| `getTransform()` | Get current viewport transform state |
| `getContentBounds()` | Get the content bounds |
## Layout Strategies
| Strategy | Description |
|----------|-------------|
| `ltr` | Left-to-right horizontal |
| `rtl` | Right-to-left horizontal |
| `ttb` | Top-to-bottom vertical |
| `btt` | Bottom-to-top vertical |
| `block` | LTR with line wrapping at maxWidth |
| `spiral` | Outward spiral from center |
| `circular` | Circular arrangement |
| `boustrophedon` | Alternating direction per line |
## File Structure
```
display/spelling/
├── GlyphSpellingDisplay.tsx      # Main component (entry point)
├── GlyphSpellingDisplay.module.scss  # Styles
├── GlyphSpellingCore.tsx         # Pure SVG rendering (static)
├── InteractiveGlyphDisplay.tsx   # Pan/zoom wrapper (interactive)
├── index.ts                      # Public exports
├── types.ts                      # TypeScript interfaces
├── __tests__/
│   └── GlyphSpellingDisplay.test.tsx
├── hooks/
│   ├── index.ts
│   ├── useNormalizedGlyphs.ts    # Input normalization
│   ├── useGlyphPositions.ts      # Position calculation
│   └── useViewport.ts            # Viewport state management
├── strategies/
│   ├── index.ts
│   ├── ltrStrategy.ts            # Horizontal LTR
│   ├── rtlStrategy.ts            # Horizontal RTL
│   ├── ttbStrategy.ts            # Vertical TTB
│   ├── bttStrategy.ts            # Vertical BTT
│   ├── blockStrategy.ts          # LTR with wrapping
│   ├── spiralStrategy.ts         # Spiral layout
│   ├── circularStrategy.ts       # Circular layout
│   └── boustrophedonStrategy.ts  # Alternating direction
└── utils/
    ├── index.ts
    ├── bounds.ts                 # Bounds calculation
    ├── config.ts                 # Layout configuration
    └── normalization.ts          # Input normalization
```
## Architecture
```
┌─────────────────────────────────────────────────────────────────┐
│                     GlyphSpellingDisplay                         │
│  (Entry point - decides between static and interactive mode)     │
└─────────────────────────────────────────────────────────────────┘
                           │
          ┌────────────────┴────────────────┐
          ▼                                 ▼
┌──────────────────┐              ┌────────────────────────┐
│ GlyphSpellingCore│              │ InteractiveGlyphDisplay│
│   (Static SVG)   │              │ (Pan/Zoom Wrapper)     │
└──────────────────┘              └────────────────────────┘
                                            │
                                            ▼
                                  ┌──────────────────┐
                                  │ GlyphSpellingCore│
                                  │   (Static SVG)   │
                                  └──────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│                          Hooks                                   │
├────────────────────┬────────────────────┬───────────────────────┤
│ useNormalizedGlyphs│ useGlyphPositions  │ useViewport           │
│ (Input → Glyphs)   │ (Glyphs → Layout)  │ (Pan/Zoom State)      │
└────────────────────┴────────────────────┴───────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│                        Strategies                                │
│  ltr | rtl | ttb | btt | block | spiral | circular | boustro    │
└─────────────────────────────────────────────────────────────────┘
```
## Canvas vs Viewport
Understanding the difference:
- **Canvas**: The internal "paper" where glyphs are positioned. Setting `canvas.width` enables text wrapping.
- **Viewport**: The visible window into the canvas. Users can pan/zoom to see different parts of the canvas.
```
┌─────────────────────────────────────────┐
│              Viewport                   │
│  ┌───────────────────────────────────┐  │
│  │    Visible area (can pan/zoom)    │  │
│  │                                   │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │        Canvas               │  │  │
│  │  │  (Internal paper size)      │  │  │
│  │  │  ABC DEF GHI                │  │  │
│  │  │  JKL MNO PQR                │  │  │
│  │  │  STU VWX YZ                 │  │  │
│  │  └─────────────────────────────┘  │  │
│  │                                   │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```
## Testing
```bash
# Run tests
pnpm test -- "spelling"
# Watch mode
pnpm test -- --watch "spelling"
```
## Dependencies
- `react-zoom-pan-pinch`: Pan/zoom functionality
- `dompurify`: SVG sanitization
- `classnames`: CSS class composition
## Migration from v1
The component maintains backward compatibility with the previous API. Existing usages with just `glyphs`, `strategy`, and `config` will continue to work in static mode.
To upgrade to interactive mode:
1. Add `mode="interactive"`
2. Add `canvas` and `viewport` configs as needed
3. Optionally add a ref for programmatic control
