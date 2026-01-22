/**
 * Form Handler
 *
 * Transforms UI form data into database input format.
 * Handles both glyph creation and grapheme creation workflows.
 *
 * Workflow:
 * 1. User draws a glyph → saveGlyph() → creates atomic visual symbol
 * 2. User creates grapheme → saveGrapheme() → links glyph(s) + adds phonemes
 */

import type {
    CreateGlyphInput,
    CreateGraphemeInput,
    GlyphFormData,
    GraphemeFormData,
    Glyph,
    GraphemeComplete
} from './types';
import { createGlyph } from './glyphService';
import { createGrapheme } from './graphemeService';

// =============================================================================
// GLYPH FORM HANDLING
// =============================================================================

/**
 * Transform glyph form data to database input format.
 */
export function transformGlyphFormToInput(formData: GlyphFormData): CreateGlyphInput {
    return {
        name: formData.glyphName.trim(),
        svg_data: formData.glyphSvg,
        notes: formData.notes?.trim() || undefined
    };
}

/**
 * Save a glyph from form data.
 * This creates a new atomic visual symbol that can be reused in graphemes.
 *
 * @param formData - Data from the glyph drawing form
 * @returns The created glyph
 */
export async function saveGlyph(formData: GlyphFormData): Promise<Glyph> {
    // Validate required fields
    if (!formData.glyphSvg || formData.glyphSvg.trim() === '') {
        throw new Error('SVG drawing is required');
    }

    if (!formData.glyphName || formData.glyphName.trim() === '') {
        throw new Error('Glyph name is required');
    }

    const input = transformGlyphFormToInput(formData);
    return createGlyph(input);
}

/**
 * Validate glyph form data.
 */
export function validateGlyphForm(formData: Partial<GlyphFormData>): string[] {
    const errors: string[] = [];

    if (!formData.glyphSvg || formData.glyphSvg.trim() === '') {
        errors.push('Please draw a glyph');
    }

    if (!formData.glyphName || formData.glyphName.trim() === '') {
        errors.push('Glyph name is required');
    }

    return errors;
}

// =============================================================================
// GRAPHEME FORM HANDLING
// =============================================================================

/**
 * Transform grapheme form data to database input format.
 */
export function transformGraphemeFormToInput(formData: GraphemeFormData): CreateGraphemeInput {
    return {
        name: formData.graphemeName.trim(),
        category: formData.category?.trim() || undefined,
        notes: formData.notes?.trim() || undefined,
        glyphs: formData.glyphIds.map((glyphId, index) => ({
            glyph_id: glyphId,
            position: index
        })),
        phonemes: formData.pronunciations
            .filter(p => p.pronunciation && p.pronunciation.trim() !== '')
            .map(p => ({
                phoneme: p.pronunciation.trim(),
                use_in_auto_spelling: p.useInAutoSpelling,
                context: undefined
            }))
    };
}

/**
 * Save a grapheme from form data.
 * Links selected glyphs and creates phoneme associations.
 *
 * @param formData - Data from the grapheme creation form
 * @returns The created grapheme with glyphs and phonemes
 */
export async function saveGrapheme(formData: GraphemeFormData): Promise<GraphemeComplete> {
    // Validate required fields
    if (!formData.glyphIds || formData.glyphIds.length === 0) {
        throw new Error('At least one glyph must be selected');
    }

    if (!formData.graphemeName || formData.graphemeName.trim() === '') {
        throw new Error('Grapheme name is required');
    }

    const input = transformGraphemeFormToInput(formData);
    return createGrapheme(input);
}

/**
 * Validate grapheme form data.
 */
export function validateGraphemeForm(formData: Partial<GraphemeFormData>): string[] {
    const errors: string[] = [];

    if (!formData.glyphIds || formData.glyphIds.length === 0) {
        errors.push('Please select at least one glyph');
    }

    if (!formData.graphemeName || formData.graphemeName.trim() === '') {
        errors.push('Grapheme name is required');
    }

    // Check if at least one pronunciation has content
    const hasValidPronunciation = formData.pronunciations?.some(
        p => p.pronunciation && p.pronunciation.trim() !== ''
    );

    if (!hasValidPronunciation) {
        errors.push('At least one pronunciation is required');
    }

    return errors;
}

// =============================================================================
// COMBINED WORKFLOW: Create Glyph + Grapheme in one step
// =============================================================================

/**
 * Combined form data for creating a glyph and immediately using it in a grapheme.
 * This is the common workflow: draw → name → add pronunciations → save.
 */
export interface CombinedGlyphGraphemeFormData {
    // Glyph data
    glyphSvg: string;
    glyphName: string;
    glyphNotes?: string;
    // Shared category for both glyph and grapheme
    category?: string;
    // Grapheme data (if different from glyph)
    graphemeName?: string;  // Falls back to glyphName if not provided
    graphemeNotes?: string;
    // Pronunciations
    pronunciations: Array<{
        pronunciation: string;
        useInAutoSpelling: boolean;
    }>;
}

/**
 * Save a glyph and create a grapheme from it in one operation.
 * This is the most common workflow for creating new script characters.
 *
 * @param formData - Combined form data
 * @returns Both the created glyph and grapheme
 */
export async function saveGlyphAndGrapheme(formData: CombinedGlyphGraphemeFormData): Promise<{
    glyph: Glyph;
    grapheme: GraphemeComplete;
}> {
    // Validate
    if (!formData.glyphSvg || formData.glyphSvg.trim() === '') {
        throw new Error('SVG drawing is required');
    }

    if (!formData.glyphName || formData.glyphName.trim() === '') {
        throw new Error('Glyph name is required');
    }

    // Create the glyph first
    const glyph = createGlyph({
        name: formData.glyphName.trim(),
        svg_data: formData.glyphSvg,
        category: formData.category?.trim() || undefined,
        notes: formData.glyphNotes?.trim() || undefined
    });

    // Then create the grapheme using that glyph
    const grapheme = createGrapheme({
        name: (formData.graphemeName || formData.glyphName).trim(),
        category: formData.category?.trim() || undefined,
        notes: formData.graphemeNotes?.trim() || undefined,
        glyphs: [{
            glyph_id: glyph.id,
            position: 0
        }],
        phonemes: formData.pronunciations
            .filter(p => p.pronunciation && p.pronunciation.trim() !== '')
            .map(p => ({
                phoneme: p.pronunciation.trim(),
                use_in_auto_spelling: p.useInAutoSpelling
            }))
    });

    return { glyph, grapheme };
}

/**
 * Validate combined form data.
 */
export function validateCombinedForm(formData: Partial<CombinedGlyphGraphemeFormData>): string[] {
    const errors: string[] = [];

    if (!formData.glyphSvg || formData.glyphSvg.trim() === '') {
        errors.push('Please draw a script character');
    }

    if (!formData.glyphName || formData.glyphName.trim() === '') {
        errors.push('Glyph name is required');
    }

    const hasValidPronunciation = formData.pronunciations?.some(
        p => p.pronunciation && p.pronunciation.trim() !== ''
    );

    if (!hasValidPronunciation) {
        errors.push('At least one pronunciation is required');
    }

    return errors;
}

// =============================================================================
// LEGACY SUPPORT (backwards compatibility)
// =============================================================================

/**
 * @deprecated Use saveGlyphAndGrapheme() instead.
 * This function is kept for backwards compatibility with existing form components.
 */
export function transformFormToGraphemeInput(formData: {
    graphemeSvg: string;
    graphemeName: string;
    category?: string;
    notes?: string;
    pronunciations: Array<{
        pronunciation: string;
        useInAutoSpelling: boolean;
    }>;
}): CreateGraphemeInput & { _legacySvgData: string; _category?: string } {
    // Return a special object that the caller needs to handle
    // by first creating a glyph, then using that glyph ID
    return {
        name: formData.graphemeName.trim(),
        category: formData.category?.trim() || undefined,
        notes: formData.notes?.trim() || undefined,
        glyphs: [], // Will need to be filled in after creating glyph
        phonemes: formData.pronunciations
            .filter(p => p.pronunciation && p.pronunciation.trim() !== '')
            .map(p => ({
                phoneme: p.pronunciation.trim(),
                use_in_auto_spelling: p.useInAutoSpelling
            })),
        _legacySvgData: formData.graphemeSvg, // Caller must use this to create glyph first
        _category: formData.category?.trim() || undefined // Caller must use this for glyph category
    };
}
