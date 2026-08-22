/**
 * useGlyphSubmit
 * --------------
 * The ONE glyph create/update submit handler.
 *
 * Three call sites need it — the create page, the edit page, and the nested
 * "new glyph while composing a grapheme" modal — and before this they each had
 * their own copy, with their own validation strings, their own
 * `isSubmittingRef` latch, and their own way of reporting failure (one
 * `console.error`d, one set local state, one did both). Errors now go to the
 * notification surface like every other action in the app.
 *
 * The SVG is normalised on the way in (see {@link normalizeGlyphSvg}): a glyph
 * stored with a baked colour cannot follow the reader's theme, and the drawing
 * canvas is not the only way markup gets in here.
 */

import { useCallback } from 'react';

import { useEtymolog, type Glyph } from '../../../db';
import { useApiAction } from '../../shared';
import type { GlyphFormData } from './GlyphFormFields';
import { normalizeGlyphSvg } from './normalizeGlyphSvg';

export interface GlyphSubmitResult {
    success: boolean;
    message?: string;
}

export interface UseGlyphSubmitOptions {
    mode: 'create' | 'edit';
    /** Required in `edit` mode. */
    initialData?: Glyph | null;
    /** Called with the saved glyph. Navigation/closing belongs to the caller. */
    onSuccess?: (glyph: Glyph) => void;
}

export function useGlyphSubmit({
    mode,
    initialData,
    onSuccess,
}: UseGlyphSubmitOptions): (formData: Record<string, unknown>) => Promise<GlyphSubmitResult> {
    const { api } = useEtymolog();
    const runApiAction = useApiAction();

    return useCallback(
        async (formData: Record<string, unknown>): Promise<GlyphSubmitResult> => {
            const data = formData as unknown as GlyphFormData;

            const svg = normalizeGlyphSvg(data.glyphSvg).trim();
            if (!svg) return { success: false, message: 'Draw the glyph before saving.' };

            const name = data.glyphName?.trim();
            if (!name) return { success: false, message: 'The glyph needs a name.' };

            const payload = {
                name,
                svg_data: svg,
                category: data.category?.trim() || undefined,
                notes: data.notes?.trim() || undefined,
            };

            const result = await runApiAction(
                () =>
                    mode === 'create'
                        ? api.glyph.create(payload)
                        : api.glyph.update(initialData!.id, payload),
                {
                    errorTitle:
                        mode === 'create' ? 'Could not create the glyph' : 'Could not save the glyph',
                },
            );

            if (!result.success || !result.data) {
                return { success: false, message: result.error?.message ?? 'The glyph was not saved.' };
            }

            onSuccess?.(result.data);
            return { success: true };
        },
        [api, initialData, mode, onSuccess, runApiAction],
    );
}

export default useGlyphSubmit;
