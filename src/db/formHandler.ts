/**
 * Form Handler
 *
 * Transforms UI form data (using friendly terms) into database input
 * (using linguistic terms). This is the bridge between the user interface
 * and the database layer.
 *
 * UI Terms → DB Terms:
 * - graphemeSvg → svg_data
 * - graphemeName → name
 * - pronunciation → phoneme
 * - useInAutoSpelling → use_in_auto_spelling
 */

import type {
    CreateGraphemeInput,
    GraphemeFormData,
    GraphemeWithPhonemes
} from './types';
import { createGrapheme } from './graphemeService';

/**
 * Transform form data from the UI into database input format.
 *
 * @param formData - Data from NewGraphemeForm component
 * @returns Database-ready input for createGrapheme()
 */
export function transformFormToGraphemeInput(formData: GraphemeFormData): CreateGraphemeInput {
    return {
        name: formData.graphemeName,
        svg_data: formData.graphemeSvg,
        notes: formData.notes || undefined,
        phonemes: formData.pronunciations
            // Filter out empty pronunciations
            .filter(p => p.pronunciation && p.pronunciation.trim() !== '')
            .map(p => ({
                phoneme: p.pronunciation.trim(),
                use_in_auto_spelling: p.useInAutoSpelling,
                context: undefined // Context is blank for now
            }))
    };
}

/**
 * Save a grapheme from form data to the database.
 * This is the main function called by the form's submit handler.
 *
 * @param formData - Data from NewGraphemeForm component
 * @returns The created grapheme with all its phonemes
 * @throws Error if validation fails or database operation fails
 */
export async function saveGrapheme(formData: GraphemeFormData): Promise<GraphemeWithPhonemes> {
    // Validate required fields
    if (!formData.graphemeSvg || formData.graphemeSvg.trim() === '') {
        throw new Error('SVG drawing is required');
    }

    if (!formData.graphemeName || formData.graphemeName.trim() === '') {
        throw new Error('Grapheme name is required');
    }

    // Transform form data to database input
    const graphemeInput = transformFormToGraphemeInput(formData);

    // Create the grapheme with phonemes
    const grapheme = createGrapheme(graphemeInput);

    return grapheme;
}

/**
 * Validate form data before submission.
 * Returns an array of error messages (empty if valid).
 *
 * @param formData - Data from NewGraphemeForm component
 * @returns Array of validation error messages
 */
export function validateGraphemeForm(formData: Partial<GraphemeFormData>): string[] {
    const errors: string[] = [];

    if (!formData.graphemeSvg || formData.graphemeSvg.trim() === '') {
        errors.push('Please draw a script character');
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
