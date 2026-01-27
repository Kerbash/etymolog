/**
 * Glyph Canvas Input Utilities
 *
 * @module glyphCanvasInput/utils
 */

export {
    calculateGlyphLayout,
    calculateBounds,
    mergeLayoutConfig,
} from './layoutUtils';

export {
    combineSvgStrings,
    extractSvgFromGrapheme,
    graphemeToRenderableGlyph,
    graphemesToRenderableGlyphs,
    renderableToGlyphWithUsage,
    isGraphemeComplete,
    hasDirectSvgData,
    normalizeToRenderable,
    buildRenderableMap,
    type RenderableGlyph,
} from './graphemeUtils';

