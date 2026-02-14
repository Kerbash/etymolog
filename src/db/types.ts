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

// =============================================================================
// LEXICON TYPES (Vocabulary Entries)
// =============================================================================

/**
 * A lexicon entry represents a word or vocabulary item in the conlang.
 * It connects pronunciation, meaning, spelling (via graphemes), and etymology.
 *
 * Two-List Architecture:
 * - glyph_order: JSON array storing the true ordered spelling (source of truth)
 * - lexicon_spelling: Junction table for relational queries only
 */
export interface Lexicon {
    id: number;
    /** Citation form / searchable name */
    lemma: string;
    /** IPA pronunciation (nullable for external reference words) */
    pronunciation: string | null;
    /** Whether this word is native to the conlang (false = external reference) */
    is_native: boolean;
    /** Whether to auto-generate spelling from pronunciation */
    auto_spell: boolean;
    /** Word definition/gloss */
    meaning: string | null;
    /** Part of speech (freeform until PoS table exists) */
    part_of_speech: string | null;
    /** Additional notes */
    notes: string | null;
    /**
     * JSON array storing the true ordered spelling.
     * Entries can be:
     * - Grapheme references: "grapheme-{id}" (e.g., "grapheme-123")
     * - IPA characters: Stored as-is (e.g., "ə", "ʃ")
     */
    glyph_order: string;
    /**
     * Flag indicating this entry needs manual review.
     * Set to true when:
     * - A grapheme used in spelling is deleted (for non-auto_spell entries)
     * - Auto-respelling fails
     */
    needs_attention: boolean;
    created_at: string;
    updated_at: string;
}

/**
 * Junction table entry linking a grapheme to a lexicon entry for spelling.
 * Position determines the order of graphemes in the word's written form.
 */
export interface LexiconSpelling {
    id: number;
    lexicon_id: number;
    grapheme_id: number;
    position: number;
}

/**
 * Junction table entry for etymological relationships between words.
 * Links a child word to its ancestor/parent word(s).
 */
export interface LexiconAncestry {
    id: number;
    /** The child/derived word */
    lexicon_id: number;
    /** The parent/source word */
    ancestor_id: number;
    /** Order for compound words (root1 + root2) */
    position: number;
    /** Type of etymological relationship */
    ancestry_type: AncestryType;
}

/**
 * Types of etymological relationships.
 */
export type AncestryType = 'derived' | 'borrowed' | 'compound' | 'blend' | 'calque' | 'other';

/**
 * Input for creating a new lexicon entry.
 */
export interface CreateLexiconInput {
    lemma?: string;
    pronunciation?: string;
    is_native?: boolean;
    auto_spell?: boolean;
    meaning?: string;
    part_of_speech?: string;
    notes?: string;
    /**
     * Ordered spelling in glyph_order format.
     * Array of strings where each entry is either:
     * - Grapheme reference: "grapheme-{id}"
     * - IPA character: The character as-is
     */
    glyph_order?: string[];
    /**
     * @deprecated Use glyph_order instead.
     * Ordered array of grapheme IDs for spelling (legacy support).
     */
    spelling?: CreateLexiconSpellingInput[];
    /** Array of ancestor references */
    ancestry?: CreateLexiconAncestryInput[];
}

/**
 * Input for linking a grapheme to a lexicon entry for spelling.
 */
export interface CreateLexiconSpellingInput {
    grapheme_id: number;
    position: number;
}

/**
 * Input for adding an ancestor to a lexicon entry.
 */
export interface CreateLexiconAncestryInput {
    ancestor_id: number;
    position: number;
    ancestry_type?: AncestryType;
}

/**
 * Input for updating a lexicon entry.
 */
export interface UpdateLexiconInput {
    lemma?: string;
    pronunciation?: string | null;
    is_native?: boolean;
    auto_spell?: boolean;
    meaning?: string | null;
    part_of_speech?: string | null;
    notes?: string | null;
    /** Update glyph_order directly */
    glyph_order?: string[];
    /** Mark/unmark entry as needing attention */
    needs_attention?: boolean;
}

/**
 * A lexicon entry with its spelling (ordered graphemes).
 */
export interface LexiconWithSpelling extends Lexicon {
    /** Graphemes in order (sorted by position) */
    spelling: Grapheme[];
}

/**
 * A lexicon entry with its direct ancestors.
 */
export interface LexiconWithAncestry extends Lexicon {
    /** Direct ancestor words with relationship metadata */
    ancestors: LexiconAncestorEntry[];
}

/**
 * An ancestor entry with relationship metadata.
 */
export interface LexiconAncestorEntry {
    /** The ancestor lexicon entry */
    ancestor: Lexicon;
    /** Position in compound words */
    position: number;
    /** Type of etymological relationship */
    ancestry_type: AncestryType;
}

/**
 * A lexicon entry with its descendants (words derived from this word).
 */
export interface LexiconWithDescendants extends Lexicon {
    /** Words derived from this word */
    descendants: LexiconDescendantEntry[];
}

/**
 * A descendant entry with relationship metadata.
 */
export interface LexiconDescendantEntry {
    /** The descendant lexicon entry */
    descendant: Lexicon;
    /** Type of etymological relationship */
    ancestry_type: AncestryType;
}

/**
 * Parsed glyph_order entry for display purposes.
 */
export interface SpellingDisplayEntry {
    /** Type of entry */
    type: 'grapheme' | 'ipa';
    /** Position in the spelling */
    position: number;
    /** Grapheme data (only for grapheme type) */
    grapheme?: Grapheme;
    /** IPA character (only for ipa type) */
    ipaCharacter?: string;
}

/**
 * Complete lexicon entry with spelling, ancestors, and descendants.
 * This is the full representation for display purposes.
 */
export interface LexiconComplete extends Lexicon {
    /**
     * Parsed spelling entries for display.
     * Includes both resolved graphemes and IPA fallback characters.
     */
    spellingDisplay: SpellingDisplayEntry[];
    /**
     * @deprecated Use spellingDisplay for full spelling.
     * Graphemes only (sorted by position, excludes IPA fallbacks).
     */
    spelling: Grapheme[];
    /** Direct ancestor words */
    ancestors: LexiconAncestorEntry[];
    /** Words derived from this word */
    descendants: LexiconDescendantEntry[];
    /** Whether the spelling contains IPA fallback characters */
    hasIpaFallbacks: boolean;
}

/**
 * Recursive ancestry tree node for full etymology visualization.
 */
export interface LexiconAncestryNode {
    /** The lexicon entry */
    entry: Lexicon;
    /** Relationship type to the child (null for the root/queried word) */
    ancestry_type: AncestryType | null;
    /** Position in the child's compound (null for the root) */
    position: number | null;
    /** Recursive ancestors */
    ancestors: LexiconAncestryNode[];
}

/**
 * For displaying a lexicon entry with usage statistics.
 */
export interface LexiconWithUsage extends Lexicon {
    /** Number of words that have this word as an ancestor */
    descendantCount: number;
}

/**
 * Lightweight reference for lexicon selection UI.
 */
export interface LexiconReference {
    id: number;
    lemma: string;
    pronunciation: string | null;
    meaning: string | null;
}

// =============================================================================
// LEXICON FORM DATA TYPES (UI ↔ DB Bridge)
// =============================================================================

/**
 * Form data for creating a lexicon entry.
 */
export interface LexiconFormData {
    lemma: string;
    pronunciation?: string;
    isNative: boolean;
    autoSpell: boolean;
    meaning?: string;
    partOfSpeech?: string;
    notes?: string;
    /** Selected grapheme IDs in order for spelling */
    spellingGraphemeIds: number[];
    /** Ancestor entries */
    ancestors: LexiconAncestorFormRow[];
}

/**
 * A single ancestor row from the form.
 */
export interface LexiconAncestorFormRow {
    ancestorId: number;
    ancestryType: AncestryType;
}

// =============================================================================
// AUTO-SPELL EXTENDED TYPES (Virtual Glyph Support)
// =============================================================================

/**
 * Extended auto-spell result that supports virtual IPA glyph fallbacks.
 * Used when auto-spell cannot match all pronunciation characters to graphemes.
 */
export interface AutoSpellResultExtended {
    success: boolean;
    /** Ordered spelling entries (may include virtual glyphs) */
    spelling: AutoSpellEntry[];
    /** Phoneme segments matched (for debugging/display) */
    segments: string[];
    /** Any unmatched portions (empty when using fallback) */
    unmatchedParts: string[];
    /** Error message if not successful */
    error?: string;
    /** Whether the result includes virtual IPA fallback glyphs */
    hasVirtualGlyphs: boolean;
}

/**
 * A single entry in the extended auto-spell result.
 * Can represent either a real grapheme or a virtual IPA fallback.
 */
export interface AutoSpellEntry {
    /** Grapheme ID (positive for real, negative for virtual) */
    grapheme_id: number;
    /** Position in the spelling sequence */
    position: number;
    /** Whether this is a virtual IPA fallback glyph */
    isVirtual: boolean;
    /** The IPA character (only present for virtual glyphs) */
    ipaCharacter?: string;
}

// =============================================================================
// PHRASE TRANSLATION TYPES (Ephemeral Translation)
// =============================================================================

/**
 * Represents a single word from an input phrase.
 */
export interface PhraseWord {
    /** Original word from input phrase */
    originalWord: string;
    /** Normalized word (lowercase, trimmed) */
    normalizedWord: string;
    /** Position in the phrase (0-indexed) */
    position: number;
}

/**
 * Translation result for a single word in a phrase.
 */
export interface PhraseWordTranslation {
    /** Original word */
    word: PhraseWord;
    /** Translation result type */
    type: 'lexicon' | 'autospell';
    /** Lexicon entry if found */
    lexiconEntry?: LexiconComplete;
    /** Spelling display entries */
    spellingDisplay: SpellingDisplayEntry[];
    /** Whether uses virtual glyphs */
    hasVirtualGlyphs: boolean;
}

/**
 * Complete result of translating an English phrase to conlang.
 * This is ephemeral - computed on-demand, not persisted to database.
 */
export interface PhraseTranslationResult {
    /** Original input phrase */
    originalPhrase: string;
    /** Normalized phrase */
    normalizedPhrase: string;
    /** Individual word translations */
    wordTranslations: PhraseWordTranslation[];
    /** Combined spelling for display (includes word separators) */
    combinedSpelling: SpellingDisplayEntry[];
    /** Whether any word uses virtual glyphs */
    hasVirtualGlyphs: boolean;
    /** Translation timestamp */
    timestamp: string;
}
