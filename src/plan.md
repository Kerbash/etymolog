# Custom Script Drawer - Implementation Plan

## Goal
Build a lightweight, custom drawing tool for creating conlang script characters with consistent sizing and SVG export capabilities.

## Core Requirements
1. **Fixed canvas size** (e.g., 300x300px) - ensures consistent character dimensions
2. **Drawing tools**: Pen, Dot, Square, Circle
3. **Drag & drop**: Move elements after drawing them
4. **Export to SVG**: Store in SQL.js database
5. **Undo/Redo**: History management
6. **Clean UI**: Minimal, focused interface

---

## Technical Architecture

### Technology Stack
- **React** - Component structure and state management
- **SVG** - Primary rendering (scalable, exportable, DOM-based for interactions)
- **Perfect Freehand** - Smooth pen strokes (~10KB)
- **Tailwind CSS** - Styling

### Why SVG over Canvas?
- ✅ Each element is a DOM node (easy drag & drop)
- ✅ Native export to SVG (just grab the innerHTML)
- ✅ Easier selection/manipulation
- ✅ Resolution independent
- ❌ Slightly slower for 1000s of elements (not a problem for single characters)

---

## Component Structure

```
<ScriptDrawer>
  ├── <Toolbar>              // Tool selection buttons
  ├── <DrawingCanvas>        // Main SVG canvas (300x300px)
  │   ├── <PenStroke>       // Path elements from Perfect Freehand
  │   ├── <Dot>             // Circle elements
  │   ├── <Square>          // Rect elements
  │   └── <Circle>          // Circle elements
  ├── <ActionBar>            // Undo, Redo, Clear, Export
  └── <CharacterPreview>     // Show saved characters
```

---

## State Management

```javascript
{
  // Current state
  activeTool: 'pen' | 'dot' | 'square' | 'circle' | 'select',
  elements: [
    {
      id: 'uuid',
      type: 'pen' | 'dot' | 'square' | 'circle',
      data: { /* tool-specific data */ },
      position: { x, y },
      selected: boolean
    }
  ],
  
  // Drawing state
  isDrawing: boolean,
  currentStroke: [],  // For pen tool
  startPoint: {},     // For shapes
  
  // History
  history: [],
  historyIndex: number,
  
  // Saved characters
  savedGlyphs: [
    { character: 'a', svg: '<svg>...</svg>' }
  ]
}
```

---

## Tool Implementation Details

### 1. Pen Tool
**Library**: Perfect Freehand
```javascript
// On mouse move (while drawing)
- Add point to currentStroke array
- Use getStroke() to generate smooth path
- Render as SVG <path>

// On mouse up
- Convert stroke to element
- Add to elements array
- Clear currentStroke
```

**Data structure**:
```javascript
{
  type: 'pen',
  data: {
    points: [{x, y, pressure}],
    pathData: 'M 10 10 L 20 20...'
  }
}
```

### 2. Dot Tool
**Simple click** = place a small circle
```javascript
// On mouse down
- Create circle element at cursor position
- Fixed radius (e.g., 3px)
```

**Data structure**:
```javascript
{
  type: 'dot',
  data: {
    x: 150,
    y: 150,
    radius: 3
  }
}
```

### 3. Square Tool
**Click + drag** = draw rectangle
```javascript
// On mouse down: Store start point
// On mouse move: Calculate width/height from start to current
// On mouse up: Finalize square

// Support shift key for perfect squares
```

**Data structure**:
```javascript
{
  type: 'square',
  data: {
    x: 100,
    y: 100,
    width: 50,
    height: 50
  }
}
```

### 4. Circle Tool
**Click + drag** = draw circle from center
```javascript
// On mouse down: Store center point
// On mouse move: Calculate radius from center to cursor
// On mouse up: Finalize circle

// Support shift key for perfect circles from any direction
```

**Data structure**:
```javascript
{
  type: 'circle',
  data: {
    cx: 150,
    cy: 150,
    rx: 30,  // radius x
    ry: 30   // radius y (for ellipses if not holding shift)
  }
}
```

---

## Drag & Drop Implementation

### Select Tool
```javascript
// On mouse down on element
- Set element.selected = true
- Store offset from cursor to element origin

// On mouse move
- Update element position based on cursor + offset

// On mouse up
- Finalize position
- Deselect
```

### Multi-select (optional future feature)
- Click outside = deselect all
- Shift+click = add to selection
- Drag box to select multiple

---

## Undo/Redo System

```javascript
// History stack approach
const [history, setHistory] = useState([]);
const [historyIndex, setHistoryIndex] = useState(-1);

// On any change
function addToHistory(newElements) {
  const newHistory = history.slice(0, historyIndex + 1);
  newHistory.push(newElements);
  setHistory(newHistory);
  setHistoryIndex(newHistory.length - 1);
}

// Undo
function undo() {
  if (historyIndex > 0) {
    setHistoryIndex(historyIndex - 1);
    setElements(history[historyIndex - 1]);
  }
}

// Redo
function redo() {
  if (historyIndex < history.length - 1) {
    setHistoryIndex(historyIndex + 1);
    setElements(history[historyIndex + 1]);
  }
}
```

---

## SVG Export

```javascript
function exportToSVG() {
  const svgElement = document.getElementById('drawing-canvas');
  
  // Clone to avoid modifying the original
  const clone = svgElement.cloneNode(true);
  
  // Remove any UI elements (selection boxes, etc.)
  clone.querySelectorAll('.ui-only').forEach(el => el.remove());
  
  // Get as string
  const svgString = new XMLSerializer().serializeToString(clone);
  
  return svgString;
}

// Save to database
async function saveCharacter(character) {
  const svg = exportToSVG();
  
  // Store in SQL.js
  db.run(
    "INSERT INTO glyphs (character, svg_data) VALUES (?, ?)",
    [character, svg]
  );
}
```

---

## UI Layout

```
┌─────────────────────────────────────────┐
│  Custom Script Drawer                   │
├─────────────────────────────────────────┤
│                                         │
│  [Pen] [Dot] [Square] [Circle] [Select]│  ← Toolbar
│                                         │
│  ┌─────────────────────────────────┐   │
│  │                                 │   │
│  │                                 │   │
│  │        300x300 Canvas           │   │  ← Fixed drawing area
│  │                                 │   │
│  │                                 │   │
│  └─────────────────────────────────┘   │
│                                         │
│  [Undo] [Redo] [Clear] [Export SVG]    │  ← Action bar
│                                         │
│  Saved Characters:                      │
│  [a] [b] [c] [d] ...                   │  ← Preview of saved glyphs
└─────────────────────────────────────────┘
```

---

## Features Breakdown by Priority

### Phase 1 (MVP) - Core Drawing
- ✅ Fixed 300x300 SVG canvas
- ✅ Pen tool (Perfect Freehand)
- ✅ Dot tool
- ✅ Square tool
- ✅ Circle tool
- ✅ Clear canvas
- ✅ Export to SVG string

### Phase 2 - Interactions
- ✅ Select tool
- ✅ Drag elements
- ✅ Delete selected element
- ✅ Undo/Redo

### Phase 3 - Persistence
- ✅ Save character with name/label
- ✅ Display saved characters
- ✅ Load character back into editor
- ✅ SQL.js integration

### Phase 4 - Polish (Optional)
- Grid/guides
- Snap to grid
- Color picker
- Stroke width
- Eraser tool
- Multi-select

---

## Bundle Size Estimate

```
React + ReactDOM:     ~130KB (gzipped)
Perfect Freehand:     ~10KB
Tailwind (tree-shaken): ~10KB
Custom code:          ~5KB
─────────────────────────────
Total:                ~155KB
```

vs Excalidraw at ~500KB+ 🎉

---

## File Structure

```
src/
├── components/
│   ├── ScriptDrawer.jsx      // Main component
│   ├── Toolbar.jsx            // Tool buttons
│   ├── DrawingCanvas.jsx      // SVG canvas
│   ├── ActionBar.jsx          // Undo/Redo/Export
│   └── CharacterPreview.jsx   // Saved glyphs display
├── hooks/
│   ├── useDrawing.js          // Drawing state & logic
│   ├── useHistory.js          // Undo/Redo logic
│   └── usePerfectFreehand.js  // Pen stroke logic
├── utils/
│   ├── svgExport.js           // SVG export utility
│   └── database.js            // SQL.js wrapper
└── App.jsx
```

---

## Open Questions

1. **Canvas size**: 300x300px? 200x200px? 400x400px?
2. **Storage**: Character name input? Auto-generate from index?
3. **Stroke color**: Black only? Or color picker?
4. **Background**: Transparent? White? Grid?
5. **Integration**: Standalone app? Part of larger conlang system?

---

## Next Steps

1. ✅ Review this plan
2. Build Phase 1 (core drawing tools)
3. Test & iterate
4. Add Phase 2 features
5. Integrate with your conlang database

Ready to start building? 🚀