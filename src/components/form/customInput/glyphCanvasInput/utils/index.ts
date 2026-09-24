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

export {
    generateVirtualGlyphId,
    generateIpaSvg,
    createVirtualGlyph,
    createVirtualGlyphs,
    isVirtualGlyphId,
    isVirtualGlyph,
    SPACE_CHARACTER,
    createSpaceGlyph,
    isWhitespaceGlyphName,
    BOUNDARY_CHARACTER,
    createBoundaryGlyph,
    isBoundaryGlyphName,
    JOIN_CHARACTER,
    createJoinGlyph,
    isJoinGlyphName,
} from './virtualGlyphUtils';

