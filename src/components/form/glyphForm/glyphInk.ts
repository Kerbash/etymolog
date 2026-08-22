/**
 * The glyph palette: one entry, `currentColor`.
 *
 * A script glyph is ONE colour by definition — the colour of the text it sits
 * in. `SvgDrawer` hides its colour picker for a single-entry palette and writes
 * this value into every element it exports, so a glyph inherits the reader's
 * text colour in either theme with no per-theme storage. Anything else is a bug
 * waiting for a theme switch: a glyph drawn in black is invisible on a dark
 * background.
 *
 * In its own module rather than next to the component that uses it: a `.tsx`
 * exporting both a component and a constant defeats react-refresh
 * (`react-refresh/only-export-components`).
 */

import type { SvgDrawerColor } from 'cyber-components/interactable/canvas/svgDrawer/types';

export const GLYPH_INK: readonly SvgDrawerColor[] = [{ name: 'ink', value: 'currentColor' }];
