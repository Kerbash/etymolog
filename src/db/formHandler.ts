/**
 * Form Handler
 *
 * Transforms UI form data (using friendly terms) into database input
 * (using linguistic terms). This is the bridge between the user interface
 * and the database layer.
 *
 * UI Terms → DB Terms:
 * - logogramSvg → svg_data
 * - logogramName → name
 * - pronunciation → phoneme
 * - useInAutoSpelling → use_in_auto_spelling
 */

import type {
    CreateGraphemeInput,
    LogogramFormData,
    GraphemeWithPhonemes
} from './types';
import { createGrapheme } from './graphemeService';

/**
 * Transform form data from the UI into database input format.
 *
 * @param formData - Data from NewLogogramForm component
 * @returns Database-ready input for createGrapheme()
 *
 * @example
 * // Form produces:
 * {
 *   logogramSvg: '<svg>...</svg>',
 *   logogramName: 'A',
 *   notes: 'First letter',
 *   pronunciations: [
 *     { pronunciation: 'a', useInAutoSpelling: true }
 *   ]
 * }
 *
 * // Transforms to:
 * {
 *   svg_data: '<svg>...</svg>',
 *   name: 'A',
 *   notes: 'First letter',
 *   phonemes: [
 *     { phoneme: 'a', use_in_auto_spelling: true }
 *   ]
 * }
 */
export function transformFormToGraphemeInput(formData: LogogramFormData): CreateGraphemeInput {
    return {
        name: formData.logogramName,
        svg_data: formData.logogramSvg,
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
 * Save a logogram from form data to the database.
 * This is the main function called by the form's submit handler.
 *
 * @param formData - Data from NewLogogramForm component
 * @returns The created grapheme with all its phonemes
 * @throws Error if validation fails or database operation fails
 *
 * @example
 * const formProps = registerForm("logogramForm", {
 *   submitFunc: async (formData) => {
 *     const grapheme = await saveLogogram(formData);
 *     return { success: true, data: grapheme };
 *   }
 * });
 */
export async function saveLogogram(formData: LogogramFormData): Promise<GraphemeWithPhonemes> {
    // Validate required fields
    if (!formData.logogramSvg || formData.logogramSvg.trim() === '') {
        throw new Error('SVG drawing is required');
    }

    if (!formData.logogramName || formData.logogramName.trim() === '') {
        throw new Error('Logogram name is required');
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
 * @param formData - Data from NewLogogramForm component
 * @returns Array of validation error messages
 */
export function validateLogogramForm(formData: Partial<LogogramFormData>): string[] {
    const errors: string[] = [];

    if (!formData.logogramSvg || formData.logogramSvg.trim() === '') {
        errors.push('Please draw a script character');
    }

    if (!formData.logogramName || formData.logogramName.trim() === '') {
        errors.push('Logogram name is required');
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
