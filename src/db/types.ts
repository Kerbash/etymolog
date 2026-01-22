/**
 * Database Type Definitions
 *
 * TypeScript interfaces for database entities.
 * Uses linguistic terminology (grapheme/phoneme) internally,
 * while the UI uses friendly terms (grapheme/pronunciation).
 */

// =============================================================================
// GRAPHEME TYPES (UI: "Grapheme" or "Script Character")
// =============================================================================

/**
 * A grapheme represents a visual symbol in the writing system.
 * In the UI, this is called a "grapheme" or "script character".
 */
export interface Grapheme {
    id: number;
    name: string;
    svg_data: string;
    notes: string | null;
    created_at: string;
    updated_at: string;
}

/**
 * Input data for creating a new grapheme.
 * Phonemes can be included to create them in a single transaction.
 */
export interface CreateGraphemeInput {
    name: string;
    svg_data: string;
    notes?: string;
    phonemes?: CreatePhonemeInput[];
}

/**
 * Input data for updating an existing grapheme.
 * All fields are optional - only provided fields will be updated.
 */
export interface UpdateGraphemeInput {
    name?: string;
    svg_data?: string;
    notes?: string | null;
}

/**
 * A grapheme with all its associated phonemes.
 * Used when you need the complete data for a script character.
 */
export interface GraphemeWithPhonemes extends Grapheme {
    phonemes: Phoneme[];
}

// =============================================================================
// PHONEME TYPES (UI: "Pronunciation")
// =============================================================================

/**
 * A phoneme represents a sound/pronunciation associated with a grapheme.
 * In the UI, this is called a "pronunciation".
 *
 * @property use_in_auto_spelling - If true, this phoneme is used for
 *           automatic spelling/transliteration features.
 * @property context - Optional context for when this pronunciation applies
 *           (e.g., "word-initial", "before vowels"). Blank for now.
 */
export interface Phoneme {
    id: number;
    grapheme_id: number;
    phoneme: string;
    use_in_auto_spelling: boolean;
    context: string | null;
}

/**
 * Input data for creating a new phoneme.
 * The grapheme_id is provided separately when calling the service.
 */
export interface CreatePhonemeInput {
    phoneme: string;
    use_in_auto_spelling?: boolean;
    context?: string;
}

/**
 * Input data for updating an existing phoneme.
 * All fields are optional - only provided fields will be updated.
 */
export interface UpdatePhonemeInput {
    phoneme?: string;
    use_in_auto_spelling?: boolean;
    context?: string | null;
}

// =============================================================================
// FORM DATA TYPES (Maps UI terms to DB terms)
// =============================================================================

/**
 * The shape of data from the NewGraphemeForm component.
 * Uses UI-friendly terms that get transformed to DB terms.
 */
export interface GraphemeFormData {
    graphemeSvg: string;
    graphemeName: string;
    notes?: string;
    pronunciations: PronunciationFormRow[];
}

/**
 * A single pronunciation row from the form.
 */
export interface PronunciationFormRow {
    pronunciation: string;
    useInAutoSpelling: boolean;
}
