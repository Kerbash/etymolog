import { useState, useRef } from "react";
import classNames from "classnames";
import { SmartForm, useSmartForm } from "smart-form/smartForm";
import IconButton from "cyber-components/interactable/buttons/iconButton/iconButton.tsx";
import { buttonStyles } from "cyber-components/interactable/buttons/button/button.tsx";
import { flex } from "utils-styles";
import { useEtymologApi, type Glyph } from "../../../db";
import GlyphFormFields, { type GlyphFormData } from "./GlyphFormFields";
import styles from "./editGlyphModal.module.scss";

interface GlyphFormProps {
    mode: "create" | "edit";
    initialData?: Glyph | null;
    onSuccess?: (glyph: Glyph) => void;
    onCancel?: () => void;
    onError?: (msg: string) => void;
    onSubmittingChange?: (isSubmitting: boolean) => void;
    className?: string;
    /** Optional function to render extra action buttons inside the button row (receives isSubmitting) */
    extraActions?: (isSubmitting: boolean) => React.ReactNode;
}

export default function GlyphForm({
    mode,
    initialData,
    onSuccess,
    onCancel,
    onError,
    onSubmittingChange,
    className,
    extraActions,
}: GlyphFormProps) {
    const { registerField, unregisterField, registerForm, isFormValid } = useSmartForm({ mode: "onChange" });
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const isSubmittingRef = useRef(false);
    const api = useEtymologApi();

    const formProps = registerForm("glyphForm", {
        submitFunc: async (formData) => {
            if (isSubmittingRef.current) {
                return { success: false, error: 'Already submitting' };
            }
            isSubmittingRef.current = true;
            setIsSubmitting(true);
            onSubmittingChange && onSubmittingChange(true);

            try {
                setError(null);

                const data = formData as unknown as GlyphFormData;

                // Validate required fields
                if (!data.glyphSvg || data.glyphSvg.trim() === '') {
                    throw new Error('Please draw a glyph');
                }
                if (!data.glyphName || data.glyphName.trim() === '') {
                    throw new Error('Glyph name is required');
                }

                let result;
                if (mode === 'create') {
                    result = api.glyph.create({
                        name: data.glyphName.trim(),
                        svg_data: data.glyphSvg,
                        category: data.category?.trim() || undefined,
                        notes: data.notes?.trim() || undefined
                    });
                } else {
                    if (!initialData) {
                        throw new Error('No glyph to edit');
                    }
                    result = api.glyph.update(initialData.id, {
                        name: data.glyphName.trim(),
                        svg_data: data.glyphSvg,
                        category: data.category?.trim() || undefined,
                        notes: data.notes?.trim() || undefined
                    });
                }

                if (!result.success) {
                    throw new Error(result.error?.message || (mode === 'create' ? 'Failed to create glyph' : 'Failed to update glyph'));
                }

                const glyph = result.data!;

                // Notify parent
                setError(null);
                isSubmittingRef.current = false;
                setIsSubmitting(false);
                onSubmittingChange && onSubmittingChange(false);
                onSuccess && onSuccess(glyph);

                return { success: true, data: glyph };
            } catch (err) {
                isSubmittingRef.current = false;
                setIsSubmitting(false);
                onSubmittingChange && onSubmittingChange(false);
                const errorMessage = err instanceof Error ? err.message : (mode === 'create' ? 'Failed to create glyph' : 'Failed to update glyph');
                setError(errorMessage);
                onError && onError(errorMessage);
                console.error("[GlyphForm] Error:", err);

                return { success: false, error: errorMessage };
            }
        }
    });

    return (
        <div className={classNames(className)}>
            {error && (
                <div className={styles.errorMessage}>
                    {error}
                </div>
            )}

            <SmartForm
                {...formProps}
                registerField={registerField}
                unregisterField={unregisterField}
                isFormValid={isFormValid}
                className={classNames(flex.flexCol, flex.flexGapM)}
            >
                <GlyphFormFields
                    registerField={registerField}
                    mode={mode}
                    initialData={initialData}
                />

                <div className={classNames(flex.flex, flex.flexGapM, styles.modalButtons)}>
                    <IconButton
                        className={classNames(buttonStyles.primary)}
                        type="submit"
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? (mode === 'create' ? 'Saving...' : 'Saving...') : (mode === 'create' ? 'Save Glyph' : 'Save Changes')}
                    </IconButton>
                    <IconButton
                        className={classNames(buttonStyles.secondary)}
                        onClick={() => onCancel && onCancel()}
                        type="button"
                        disabled={isSubmitting}
                    >
                        Cancel
                    </IconButton>

                    {extraActions && extraActions(isSubmitting)}
                </div>
            </SmartForm>
        </div>
    );
}
