/**
 * API Layer Type Definitions
 *
 * Standardized types for the virtual "backend" API layer.
 * All API operations return ApiResponse<T> for consistent error handling.
 */

// =============================================================================
// API RESPONSE TYPES
// =============================================================================

/**
 * Standard API response wrapper for all operations.
 * Provides consistent success/error handling across the API layer.
 */
export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: ApiError;
}

/**
 * Standardized error object for API responses.
 */
export interface ApiError {
    code: ApiErrorCode;
    message: string;
    details?: Record<string, unknown>;
}

/**
 * Error codes for API operations.
 */
export type ApiErrorCode =
    | 'DB_NOT_INITIALIZED'
    | 'VALIDATION_ERROR'
    | 'NOT_FOUND'
    | 'CONSTRAINT_VIOLATION'
    | 'OPERATION_FAILED'
    | 'UNKNOWN_ERROR';

// =============================================================================
// SETTINGS TYPES
// =============================================================================

/**
 * Configuration for a single punctuation mark.
 * Controls how word/sentence separators and punctuation are rendered.
 */
export interface PunctuationConfig {
    /**
     * Grapheme ID to use for this punctuation mark.
     * null means use the default virtual glyph (IPA character).
     */
    graphemeId: number | null;

    /**
     * When true, this punctuation mark is not rendered at all.
     * Takes precedence over graphemeId.
     */
    useNoGlyph: boolean;
}

/**
 * All punctuation settings for a conlang.
 * These define how separators and punctuation marks are rendered in translations.
 */
export interface PunctuationSettings {
    /** Word separator (space equivalent) */
    wordSeparator: PunctuationConfig;
    /** Sentence separator (period equivalent) */
    sentenceSeparator: PunctuationConfig;
    /** Comma */
    comma: PunctuationConfig;
    /** Question mark */
    questionMark: PunctuationConfig;
    /** Exclamation mark */
    exclamationMark: PunctuationConfig;
    /** Colon */
    colon: PunctuationConfig;
    /** Semicolon */
    semicolon: PunctuationConfig;
    /** Ellipsis */
    ellipsis: PunctuationConfig;
    /** Quotation marks (open) */
    quotationOpen: PunctuationConfig;
    /** Quotation marks (close) */
    quotationClose: PunctuationConfig;
}

/**
 * Default punctuation configuration (virtual glyph, not hidden).
 */
export const DEFAULT_PUNCTUATION_CONFIG: PunctuationConfig = {
    graphemeId: null,
    useNoGlyph: false,
};

/**
 * Default punctuation settings for all marks.
 */
export const DEFAULT_PUNCTUATION_SETTINGS: PunctuationSettings = {
    wordSeparator: { ...DEFAULT_PUNCTUATION_CONFIG },
    sentenceSeparator: { ...DEFAULT_PUNCTUATION_CONFIG },
    comma: { ...DEFAULT_PUNCTUATION_CONFIG },
    questionMark: { ...DEFAULT_PUNCTUATION_CONFIG },
    exclamationMark: { ...DEFAULT_PUNCTUATION_CONFIG },
    colon: { ...DEFAULT_PUNCTUATION_CONFIG },
    semicolon: { ...DEFAULT_PUNCTUATION_CONFIG },
    ellipsis: { ...DEFAULT_PUNCTUATION_CONFIG },
    quotationOpen: { ...DEFAULT_PUNCTUATION_CONFIG },
    quotationClose: { ...DEFAULT_PUNCTUATION_CONFIG },
};

/**
 * Application settings managed by the API layer.
 *
 * Settings are stored in two locations:
 * - Global settings (localStorage): App-wide preferences that persist across all conlangs
 * - Conlang settings (SQLite): Per-conlang settings that travel with the database file
 *
 * Currently all settings are stored in localStorage for simplicity,
 * but conlang-specific settings like autoManageGlyphs are designed to be
 * migrated to SQLite storage in the future.
 */
export interface EtymologSettings {
    /**
     * When true, uses a simplified script system mode.
     * This setting affects how graphemes and glyphs are displayed/managed.
     * Currently reserved for future use.
     */
    simpleScriptSystem: boolean;

    /**
     * Default view mode for galleries.
     */
    defaultGalleryView: 'compact' | 'detailed' | 'expanded';

    /**
     * Auto-save interval in milliseconds (0 = disabled).
     */
    autoSaveInterval: number;

    /**
     * When true, automatically manages orphaned glyphs.
     * Orphaned glyphs (not used by any grapheme) may be cleaned up automatically.
     * This is a conlang-specific setting.
     */
    autoManageGlyphs: boolean;

    /**
     * Punctuation settings for the conlang.
     * Controls how word separators, sentence endings, and punctuation marks are rendered.
     * This is a conlang-specific setting.
     */
    punctuation: PunctuationSettings;

    /**
     * Writing system settings for the conlang.
     * Controls directional flow of glyphs, words, and lines.
     * This is a conlang-specific setting.
     */
    writingSystem: WritingSystemSettings;
}

// =============================================================================
// WRITING SYSTEM TYPES
// =============================================================================

/**
 * Directional flow value for writing system rules.
 */
export type DirectionValue = 'ltr' | 'rtl' | 'ttb' | 'btu';

/**
 * Writing system settings that define how the script flows directionally.
 * Controls glyph arrangement within words, word ordering, and line wrapping.
 */
export interface WritingSystemSettings {
    /** How glyphs flow within a word */
    glyphDirection: DirectionValue;
    /** How words flow in a sentence/line */
    wordOrder: DirectionValue;
    /** Where new lines go when wrapping */
    lineProgression: DirectionValue;
    /** Multi-glyph grapheme layout */
    glyphStacking: 'horizontal' | 'vertical' | 'none';
    /** Wrapping behavior */
    wordWrap: 'word' | 'glyph' | 'none';
    /** Glyph alignment within a line */
    baselineAlignment: 'top' | 'center' | 'bottom';
}

/**
 * Default writing system settings (standard LTR horizontal script).
 */
export const DEFAULT_WRITING_SYSTEM_SETTINGS: WritingSystemSettings = {
    glyphDirection: 'ltr',
    wordOrder: 'ltr',
    lineProgression: 'ttb',
    glyphStacking: 'horizontal',
    wordWrap: 'word',
    baselineAlignment: 'bottom',
};

/**
 * Default settings values.
 */
export const DEFAULT_SETTINGS: EtymologSettings = {
    simpleScriptSystem: false,
    defaultGalleryView: 'compact',
    autoSaveInterval: 0,
    autoManageGlyphs: false,
    punctuation: { ...DEFAULT_PUNCTUATION_SETTINGS },
    writingSystem: { ...DEFAULT_WRITING_SYSTEM_SETTINGS },
};

/**
 * Input for updating settings (partial update).
 */
export type UpdateSettingsInput = Partial<EtymologSettings>;

// =============================================================================
// GLYPH API TYPES
// =============================================================================

/**
 * Input for creating a new glyph via API.
 */
export interface CreateGlyphRequest {
    name: string;
    svg_data: string;
    category?: string;
    notes?: string;
}

/**
 * Input for updating a glyph via API.
 */
export interface UpdateGlyphRequest {
    name?: string;
    svg_data?: string;
    category?: string;
    notes?: string | null;
}

/**
 * Response for glyph list operations.
 */
export interface GlyphListResponse {
    glyphs: import('../types').Glyph[];
    total: number;
}

/**
 * Response for glyphs with usage data.
 */
export interface GlyphWithUsageListResponse {
    glyphs: import('../types').GlyphWithUsage[];
    total: number;
}

// =============================================================================
// GRAPHEME API TYPES
// =============================================================================

/**
 * Input for creating a new grapheme via API.
 */
export interface CreateGraphemeRequest {
    name: string;
    category?: string;
    notes?: string;
    glyphs: Array<{
        glyph_id: number;
        position: number;
        transform?: string;
    }>;
    phonemes?: Array<{
        phoneme: string;
        use_in_auto_spelling?: boolean;
        context?: string;
    }>;
}

/**
 * Input for updating a grapheme via API.
 */
export interface UpdateGraphemeRequest {
    name?: string;
    category?: string;
    notes?: string | null;
}

/**
 * Input for updating grapheme's glyph composition.
 */
export interface UpdateGraphemeGlyphsRequest {
    glyphs: Array<{
        glyph_id: number;
        position: number;
        transform?: string;
    }>;
}

/**
 * Response for grapheme list operations.
 */
export interface GraphemeListResponse {
    graphemes: import('../types').Grapheme[];
    total: number;
}

/**
 * Response for complete grapheme list operations.
 */
export interface GraphemeCompleteListResponse {
    graphemes: import('../types').GraphemeComplete[];
    total: number;
}

// =============================================================================
// PHONEME API TYPES
// =============================================================================

/**
 * Input for adding a phoneme to a grapheme.
 */
export interface AddPhonemeRequest {
    grapheme_id: number;
    phoneme: string;
    use_in_auto_spelling?: boolean;
    context?: string;
}

/**
 * Input for updating a phoneme.
 */
export interface UpdatePhonemeRequest {
    phoneme?: string;
    use_in_auto_spelling?: boolean;
    context?: string | null;
}

// =============================================================================
// DATABASE API TYPES
// =============================================================================

/**
 * Database status information.
 */
export interface DatabaseStatus {
    initialized: boolean;
    glyphCount: number;
    graphemeCount: number;
    lastPersisted?: string;
}

/**
 * Export format options.
 */
export type ExportFormat = 'sqlite' | 'json';

// =============================================================================
// API INTERFACE DEFINITIONS
// =============================================================================

/**
 * Glyph API interface - all glyph-related operations.
 */
export interface GlyphApi {
    create(request: CreateGlyphRequest): ApiResponse<import('../types').Glyph>;
    getById(id: number): ApiResponse<import('../types').Glyph>;
    getAll(): ApiResponse<GlyphListResponse>;
    getAllWithUsage(): ApiResponse<GlyphWithUsageListResponse>;
    search(query: string): ApiResponse<GlyphListResponse>;
    update(id: number, request: UpdateGlyphRequest): ApiResponse<import('../types').Glyph>;
    delete(id: number): ApiResponse<void>;
    forceDelete(id: number): ApiResponse<void>;
    cascadeDelete(id: number): ApiResponse<void>;
    checkNameExists(name: string, excludeId?: number): ApiResponse<boolean>;
}

/**
 * Grapheme API interface - all grapheme-related operations.
 */
export interface GraphemeApi {
    create(request: CreateGraphemeRequest): ApiResponse<import('../types').GraphemeComplete>;
    getById(id: number): ApiResponse<import('../types').Grapheme>;
    getByIdComplete(id: number): ApiResponse<import('../types').GraphemeComplete>;
    getAll(): ApiResponse<GraphemeListResponse>;
    getAllComplete(): ApiResponse<GraphemeCompleteListResponse>;
    search(query: string): ApiResponse<GraphemeListResponse>;
    update(id: number, request: UpdateGraphemeRequest): ApiResponse<import('../types').Grapheme>;
    updateGlyphs(id: number, request: UpdateGraphemeGlyphsRequest): ApiResponse<void>;
    delete(id: number): ApiResponse<void>;
    /** Get a grapheme by its associated phoneme (IPA character) */
    getByPhoneme(phoneme: string): ApiResponse<import('../types').GraphemeComplete | null>;
    /** Get a mapping of all phonemes to their associated graphemes */
    getPhonemeMap(): ApiResponse<Map<string, import('../types').GraphemeComplete>>;
}

/**
 * Phoneme API interface - all phoneme-related operations.
 */
export interface PhonemeApi {
    add(request: AddPhonemeRequest): ApiResponse<import('../types').Phoneme>;
    getById(id: number): ApiResponse<import('../types').Phoneme>;
    getByGraphemeId(graphemeId: number): ApiResponse<import('../types').Phoneme[]>;
    update(id: number, request: UpdatePhonemeRequest): ApiResponse<import('../types').Phoneme>;
    delete(id: number): ApiResponse<void>;
    deleteAllForGrapheme(graphemeId: number): ApiResponse<number>;
    getAutoSpelling(): ApiResponse<import('../types').Phoneme[]>;
}

/**
 * Settings API interface - application settings management.
 */
export interface SettingsApi {
    get(): ApiResponse<EtymologSettings>;
    update(settings: UpdateSettingsInput): ApiResponse<EtymologSettings>;
    reset(): ApiResponse<EtymologSettings>;
}

/**
 * Database API interface - database management operations.
 */
export interface DatabaseApi {
    getStatus(): ApiResponse<DatabaseStatus>;
    export(format?: ExportFormat): ApiResponse<Blob>;
    import(file: File): Promise<ApiResponse<void>>;
    clear(): ApiResponse<void>;
    reset(): ApiResponse<void>;
}

/**
 * Complete Etymolog API interface.
 * This is the main interface exposed to the frontend through the context.
 */
export interface EtymologApi {
    glyph: GlyphApi;
    grapheme: GraphemeApi;
    phoneme: PhonemeApi;
    settings: SettingsApi;
    database: DatabaseApi;
    lexicon: import('./lexiconApi').LexiconApi;
    phrase: import('./phraseApi').PhraseApi;
}
