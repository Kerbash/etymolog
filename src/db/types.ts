/**
 * Database Type Definitions
 *
 * TypeScript interfaces for the Glyph → Grapheme → Phoneme architecture.
 *
 * Architecture:
 * - Glyph: An atomic visual symbol (SVG drawing) - reusable across graphemes
 * - Grapheme: A composition of one or more glyphs in a specific order
 * - Phoneme: A pronunciation/sound associated with a grapheme
 *
 * Relationships:
 * - Glyph ←(N:M)→ Grapheme (via grapheme_glyphs junction table with position)
 * - Grapheme ←(1:N)→ Phoneme
 */

// =============================================================================
// GLYPH TYPES (Atomic Visual Unit)
// =============================================================================

/**
 * A glyph is an atomic visual symbol - the smallest drawable unit.
 * Glyphs are reusable and can be composed into multiple graphemes.
 */
export interface Glyph {
    id: number;
    name: string;
    svg_data: string;
    category: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
}

/**
 * Input for creating a new glyph.
 */
export interface CreateGlyphInput {
    name: string;
    svg_data: string;
    category?: string;
    notes?: string;
}

/**
 * Input for updating an existing glyph.
 */
export interface UpdateGlyphInput {
    name?: string;
    svg_data?: string;
    category?: string | null;
    notes?: string | null;
}

// =============================================================================
// GRAPHEME TYPES (Composition of Glyphs)
// =============================================================================

/**
 * A grapheme is a written unit composed of one or more glyphs.
 * It represents a meaningful character in the writing system.
 * The actual visual representation comes from its associated glyphs.
 */
export interface Grapheme {
    id: number;
    name: string;
    category: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
}

/**
 * Junction table entry linking a glyph to a grapheme with position.
 * Position determines the order of glyphs within the grapheme.
 */
export interface GraphemeGlyph {
    id: number;
    grapheme_id: number;
    glyph_id: number;
    position: number;
    /** Reserved for future: transformation data (rotation, scale, offset) */
    transform: string | null;
}

/**
 * Input for linking a glyph to a grapheme.
 */
export interface CreateGraphemeGlyphInput {
    glyph_id: number;
    position: number;
    transform?: string;
}

/**
 * Input for creating a new grapheme with its glyph composition.
 */
export interface CreateGraphemeInput {
    name: string;
    category?: string;
    notes?: string;
    /** Ordered array of glyph references */
    glyphs: CreateGraphemeGlyphInput[];
    /** Optional phonemes to create with the grapheme */
    phonemes?: CreatePhonemeInput[];
}

/**
 * Input for updating a grapheme (not its glyph composition).
 */
export interface UpdateGraphemeInput {
    name?: string;
    category?: string | null;
    notes?: string | null;
}

/**
 * A grapheme with its ordered glyph composition.
 */
export interface GraphemeWithGlyphs extends Grapheme {
    /** Glyphs in order (sorted by position) */
    glyphs: Glyph[];
}

/**
 * A grapheme with all its phonemes.
 */
export interface GraphemeWithPhonemes extends Grapheme {
    phonemes: Phoneme[];
}

/**
 * Complete grapheme with both glyphs and phonemes.
 * This is the full representation for display purposes.
 */
export interface GraphemeComplete extends Grapheme {
    /** Glyphs in order (sorted by position) */
    glyphs: Glyph[];
    phonemes: Phoneme[];
}

// =============================================================================
// PHONEME TYPES (Pronunciation)
// =============================================================================

/**
 * A phoneme represents a sound/pronunciation associated with a grapheme.
 * In the UI, this is called a "pronunciation".
 */
export interface Phoneme {
    id: number;
    grapheme_id: number;
    phoneme: string;
    use_in_auto_spelling: boolean;
    context: string | null;
}

/**
 * Input for creating a new phoneme.
 */
export interface CreatePhonemeInput {
    phoneme: string;
    use_in_auto_spelling?: boolean;
    context?: string;
}

/**
 * Input for updating a phoneme.
 */
export interface UpdatePhonemeInput {
    phoneme?: string;
    use_in_auto_spelling?: boolean;
    context?: string | null;
}

// =============================================================================
// FORM DATA TYPES (UI ↔ DB Bridge)
// =============================================================================

/**
 * Form data for creating a new glyph (from the drawing form).
 */
export interface GlyphFormData {
    glyphSvg: string;
    glyphName: string;
    category?: string;
    notes?: string;
}

/**
 * Form data for creating a grapheme with glyph selection and pronunciations.
 */
export interface GraphemeFormData {
    graphemeName: string;
    category?: string;
    notes?: string;
    /** Selected glyph IDs in order */
    glyphIds: number[];
    pronunciations: PronunciationFormRow[];
}

/**
 * A single pronunciation row from the form.
 */
export interface PronunciationFormRow {
    pronunciation: string;
    useInAutoSpelling: boolean;
}

// =============================================================================
// COMPOSITE/DISPLAY TYPES
// =============================================================================

/**
 * For displaying a glyph with usage statistics.
 */
export interface GlyphWithUsage extends Glyph {
    /** Number of graphemes using this glyph */
    usageCount: number;
}

/**
 * Lightweight reference for glyph selection UI.
 */
export interface GlyphReference {
    id: number;
    name: string;
    svg_data: string;
}
