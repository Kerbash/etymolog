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
 * Two-Layer Architecture:
 * - Frontend Layer: React components use EtymologContext via useEtymolog() hook
 * - Backend Layer: API layer wraps database services with standardized responses
 *
 * @example
 * // New recommended approach (via context)
 * import { useEtymolog, EtymologProvider } from '../db';
 * const { api, data, isLoading } = useEtymolog();
 *
 * // Legacy approach (direct imports) - deprecated
 * import { initDatabase, createGlyph, createGrapheme, useGlyphs, useGraphemes } from '../db';
 */

// =============================================================================
// CONTEXT & API (Recommended - Two-Layer Architecture)
// =============================================================================
export {
    // Context Provider
    EtymologProvider,
    // Main hook
    useEtymolog,
    // Convenience hooks
    useEtymologApi,
    useEtymologData,
    useEtymologSettings,
    useEtymologStatus,
    // Types
    type EtymologContextValue,
    type EtymologData,
} from './context';

export {
    // Full API object
    etymologApi,
    // Individual APIs
    glyphApi,
    graphemeApi,
    phonemeApi,
    settingsApi,
    databaseApi,
    // API Types
    type ApiResponse,
    type ApiError,
    type ApiErrorCode,
    type EtymologSettings,
    type EtymologApi,
    type GlyphApi,
    type GraphemeApi,
    type PhonemeApi,
    type SettingsApi,
    type DatabaseApi,
    // Request/Response types
    type CreateGlyphRequest,
    type UpdateGlyphRequest,
    type CreateGraphemeRequest,
    type UpdateGraphemeRequest,
    type AddPhonemeRequest,
    type UpdatePhonemeRequest,
    // Constants
    DEFAULT_SETTINGS,
} from './api';

// =============================================================================
// DATABASE MANAGEMENT (Legacy - for backwards compatibility)
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
    // Lexicon types
    Lexicon,
    LexiconSpelling,
    LexiconAncestry,
    LexiconWithSpelling,
    LexiconWithAncestry,
    LexiconWithDescendants,
    LexiconComplete,
    LexiconAncestorEntry,
    LexiconDescendantEntry,
    LexiconAncestryNode,
    LexiconWithUsage,
    LexiconReference,
    CreateLexiconInput,
    UpdateLexiconInput,
    CreateLexiconSpellingInput,
    CreateLexiconAncestryInput,
    AncestryType,
    SpellingDisplayEntry,
    // Form types
    GlyphFormData,
    GraphemeFormData,
    PronunciationFormRow,
    LexiconFormData,
    LexiconAncestorFormRow
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
    glyphNameExists,
    cleanupOrphanedGlyphs
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
// LEXICON CRUD OPERATIONS
// =============================================================================
export {
    createLexicon,
    getLexiconById,
    getLexiconWithSpelling,
    getLexiconWithAncestry,
    getLexiconWithDescendants,
    getLexiconComplete,
    getAllLexicon,
    getAllLexiconWithSpelling,
    getAllLexiconComplete,
    getAllLexiconWithUsage,
    searchLexicon,
    getLexiconByNative,
    updateLexicon,
    deleteLexicon,
    getLexiconCount,
    // Spelling operations
    getSpellingByLexiconId,
    getLexiconSpellingEntries,
    addSpellingToLexicon,
    setLexiconSpelling,
    clearLexiconSpelling,
    syncLexiconSpellingFromGlyphOrder,
    buildSpellingDisplay,
    setLexiconGlyphOrder,
    // Ancestry operations
    getAncestorsByLexiconId,
    getDescendantsByLexiconId,
    getLexiconAncestryEntries,
    addAncestorToLexicon,
    setLexiconAncestry,
    removeAncestorFromLexicon,
    clearLexiconAncestry,
    // Recursive ancestry
    getFullAncestryTree,
    getAllAncestorIds,
    getAllDescendantIds,
    wouldCreateCycle,
    // Grapheme deletion handling
    getLexiconEntriesUsingGrapheme,
    handleGraphemeDeletion,
    getLexiconEntriesNeedingAttention,
    clearNeedsAttention
} from './lexiconService';

// =============================================================================
// SPELLING UTILITIES
// =============================================================================
export {
    GRAPHEME_PREFIX,
    isGraphemeEntry,
    extractGraphemeId,
    createGraphemeEntry,
    parseSpellingEntry,
    parseGlyphOrder,
    extractGraphemeIds,
    toGlyphOrder,
    fromGlyphOrder,
    legacyToGlyphOrder,
    validateGlyphOrder,
    spellingContainsGrapheme,
    replaceGraphemeWithIpa,
    removeGraphemeFromSpelling,
    serializeGlyphOrder,
    deserializeGlyphOrder,
    type SpellingEntry,
    type ParsedSpellingEntry,
    type ExtractedGraphemeIds
} from './utils/spellingUtils';

// =============================================================================
// AUTO-SPELL SERVICE
// =============================================================================
export {
    generateSpellingFromPronunciation,
    previewAutoSpelling,
    getAvailablePhonemeMap,
    type AutoSpellResult
} from './autoSpellService';

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
// REACT HOOKS (Legacy - prefer useEtymolog() from context)
// =============================================================================
/** @deprecated Use useEtymolog() from EtymologContext instead */
export { useGlyphs } from './useGlyphs';
/** @deprecated Use useEtymolog() from EtymologContext instead */
export { useGraphemes, useDatabase } from './useGraphemes';
