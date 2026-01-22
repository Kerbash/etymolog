/**
 * Database Module Exports
 *
 * Re-exports all database-related functionality for easy importing.
 *
 * @example
 * import { initDatabase, createGrapheme, useGraphemes } from '../db';
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
    clearDatabase
} from './database';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================
export type {
    // Grapheme types
    Grapheme,
    CreateGraphemeInput,
    UpdateGraphemeInput,
    GraphemeWithPhonemes,
    // Phoneme types
    Phoneme,
    CreatePhonemeInput,
    UpdatePhonemeInput,
    // Form types
    GraphemeFormData,
    PronunciationFormRow
} from './types';

// =============================================================================
// GRAPHEME CRUD OPERATIONS
// =============================================================================
export {
    createGrapheme,
    getGraphemeById,
    getGraphemeWithPhonemes,
    getAllGraphemes,
    getAllGraphemesWithPhonemes,
    searchGraphemesByName,
    updateGrapheme,
    deleteGrapheme,
    getGraphemeCount
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
    transformFormToGraphemeInput,
    saveGrapheme,
    validateGraphemeForm
} from './formHandler';

// =============================================================================
// REACT HOOKS
// =============================================================================
export { useGraphemes, useDatabase } from './useGraphemes';
