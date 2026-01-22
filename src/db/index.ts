/**
 * Database Module Exports
 *
 * Re-exports all database-related functionality for easy importing.
 *
 * Architecture: Glyph → Grapheme → Phoneme
 * - Glyph: Atomic visual symbol (SVG drawing) - reusable
 * - Grapheme: Composition of glyphs - represents a written character
 * - Phoneme: Pronunciation associated with a grapheme
 *
 * @example
 * import { initDatabase, createGlyph, createGrapheme, useGlyphs, useGraphemes } from '../db';
 */

// =============================================================================
// DATABASE MANAGEMENT
// =============================================================================
export {
    initDatabase,
    getDatabase,
    isDatabaseInitialized,
    persistDatabase,
    exportDatabaseFile,
    importDatabaseFile,
    closeDatabase,
    clearDatabase,
    resetDatabase
} from './database';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================
export type {
    // Glyph types
    Glyph,
    CreateGlyphInput,
    UpdateGlyphInput,
    GlyphWithUsage,
    GlyphReference,
    // Grapheme types
    Grapheme,
    CreateGraphemeInput,
    UpdateGraphemeInput,
    GraphemeGlyph,
    CreateGraphemeGlyphInput,
    GraphemeWithGlyphs,
    GraphemeWithPhonemes,
    GraphemeComplete,
    // Phoneme types
    Phoneme,
    CreatePhonemeInput,
    UpdatePhonemeInput,
    // Form types
    GlyphFormData,
    GraphemeFormData,
    PronunciationFormRow
} from './types';

// =============================================================================
// GLYPH CRUD OPERATIONS
// =============================================================================
export {
    createGlyph,
    getGlyphById,
    getAllGlyphs,
    getAllGlyphsWithUsage,
    getGlyphReferences,
    searchGlyphsByName,
    updateGlyph,
    deleteGlyph,
    forceDeleteGlyph,
    getGlyphCount,
    glyphNameExists
} from './glyphService';

// =============================================================================
// GRAPHEME CRUD OPERATIONS
// =============================================================================
export {
    createGrapheme,
    getGraphemeById,
    getGraphemeWithGlyphs,
    getGraphemeWithPhonemes,
    getGraphemeComplete,
    getAllGraphemes,
    getAllGraphemesWithGlyphs,
    getAllGraphemesWithPhonemes,
    getAllGraphemesComplete,
    searchGraphemesByName,
    updateGrapheme,
    deleteGrapheme,
    getGraphemeCount,
    // Grapheme-Glyph relationships
    getGlyphsByGraphemeId,
    getGraphemeGlyphEntries,
    addGlyphToGrapheme,
    removeGlyphFromGrapheme,
    setGraphemeGlyphs,
    reorderGraphemeGlyphs
} from './graphemeService';

// =============================================================================
// PHONEME CRUD OPERATIONS
// =============================================================================
export {
    addPhoneme,
    getPhonemeById,
    getPhonemesByGraphemeId,
    updatePhoneme,
    deletePhoneme,
    deleteAllPhonemesForGrapheme,
    getAutoSpellingPhonemes
} from './graphemeService';

// =============================================================================
// FORM HANDLERS
// =============================================================================
export {
    // Glyph form
    transformGlyphFormToInput,
    saveGlyph,
    validateGlyphForm,
    // Grapheme form
    transformGraphemeFormToInput,
    saveGrapheme,
    validateGraphemeForm,
    // Combined workflow (most common)
    saveGlyphAndGrapheme,
    validateCombinedForm,
    // Legacy support
    transformFormToGraphemeInput
} from './formHandler';

export type { CombinedGlyphGraphemeFormData } from './formHandler';

// =============================================================================
// REACT HOOKS
// =============================================================================
export { useGlyphs } from './useGlyphs';
export { useGraphemes, useDatabase } from './useGraphemes';
