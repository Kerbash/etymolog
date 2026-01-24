/**
 * EditGlyphModal
 * ---------------
 * Modal component for editing an existing glyph inline.
 * Used when editing glyphs within GraphemeFormFields without navigating away.
 *
 * This is a modal wrapper around GlyphFormFields similar to NewGlyphModal,
 * but for editing rather than creating.
 */

import { useState, useRef, useEffect } from "react";
import classNames from "classnames";
import Modal from "cyber-components/container/modal/modal";
import { SmartForm, useSmartForm } from "smart-form/smartForm";
import IconButton from "cyber-components/interactable/buttons/iconButton/iconButton.tsx";
import { buttonStyles } from "cyber-components/interactable/buttons/button/button";
import Button from "cyber-components/interactable/buttons/button/button.tsx";
import { flex, graphic } from "utils-styles";
import { useEtymologApi, type Glyph } from "../../../db";
import GlyphFormFields, { type GlyphFormData } from "./GlyphFormFields";
import styles from "./editGlyphModal.module.scss";

interface EditGlyphModalProps {
    /** Whether the modal is open */
    isOpen: boolean;
    /** Callback to set modal open state */
    setIsOpen: (open: boolean) => void;
    /** The glyph to edit */
    glyph: Glyph | null;
    /** Callback when glyph is successfully updated */
    onGlyphUpdated: (glyph: Glyph) => void;
    /** Optional callback when glyph is deleted */
    onGlyphDeleted?: (glyphId: number) => void;
    /** Whether to show delete option (default: true) */
    showDelete?: boolean;
}

export default function EditGlyphModal({
    isOpen,
    setIsOpen,
    glyph,
    onGlyphUpdated,
    onGlyphDeleted,
    showDelete = true,
}: EditGlyphModalProps) {
    const { registerField, unregisterField, registerForm, isFormValid } = useSmartForm({ mode: "onChange" });
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const isSubmittingRef = useRef(false);
    const api = useEtymologApi();

    // Reset error state when modal opens/closes or glyph changes
    useEffect(() => {
        if (isOpen) {
            setError(null);
            setShowDeleteConfirm(false);
            isSubmittingRef.current = false;
        }
    }, [isOpen, glyph?.id]);

    const handleClose = () => {
        setError(null);
        setShowDeleteConfirm(false);
        isSubmittingRef.current = false;
        setIsOpen(false);
    };

    const formProps = registerForm("editGlyphModalForm", {
        submitFunc: async (formData) => {
            if (isSubmittingRef.current || !glyph) {
                return { success: false, error: 'Invalid state' };
            }
            isSubmittingRef.current = true;
            setIsSubmitting(true);

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

                // Update the glyph via API
                const result = api.glyph.update(glyph.id, {
                    name: data.glyphName.trim(),
                    svg_data: data.glyphSvg,
                    category: data.category?.trim() || undefined,
                    notes: data.notes?.trim() || undefined
                });

                if (!result.success) {
                    throw new Error(result.error?.message || 'Failed to update glyph');
                }

                const updatedGlyph = result.data!;
                console.log("[EditGlyphModal] Updated glyph:", updatedGlyph);

                // Close modal and notify parent
                setError(null);
                isSubmittingRef.current = false;
                setIsSubmitting(false);
                setIsOpen(false);

                // Notify parent after a short delay so the modal close has propagated
                setTimeout(() => onGlyphUpdated(updatedGlyph), 20);

                return { success: true, data: updatedGlyph };
            } catch (err) {
                isSubmittingRef.current = false;
                setIsSubmitting(false);
                const errorMessage = err instanceof Error ? err.message : 'Failed to update glyph';
                setError(errorMessage);
                console.error("[EditGlyphModal] Error:", err);

                return { success: false, error: errorMessage };
            }
        }
    });

    const handleDelete = async () => {
        if (!glyph || isDeleting) return;

        setIsDeleting(true);
        try {
            // Use forceDelete to remove from grapheme_glyphs if needed
            const result = api.glyph.forceDelete(glyph.id);
            if (!result.success) {
                throw new Error(result.error?.message || 'Failed to delete glyph');
            }

            setShowDeleteConfirm(false);
            setIsOpen(false);

            // Notify parent
            setTimeout(() => onGlyphDeleted?.(glyph.id), 20);
        } catch (err) {
            console.error('[EditGlyphModal] Delete error:', err);
            setError(err instanceof Error ? err.message : 'Failed to delete glyph');
        } finally {
            setIsDeleting(false);
        }
    };

    if (!glyph) return null;

    return (
        <Modal
            isOpen={isOpen}
            setIsOpen={setIsOpen}
            onClose={handleClose}
            allowClose={!isSubmitting && !isDeleting}
        >
            <div className={classNames(styles.modalContent)}>
                <h2 className={graphic.underlineHighlightColorPrimary}>
                    Edit Glyph: {glyph.name}
                </h2>

                {error && (
                    <div className={styles.errorMessage}>
                        {error}
                    </div>
                )}

                {showDeleteConfirm ? (
                    <div className={styles.deleteConfirm}>
                        <p>Are you sure you want to delete "{glyph.name}"?</p>
                        <p className={styles.warningText}>
                            ⚠️ This will remove the glyph from this grapheme.
                        </p>
                        <div className={classNames(flex.flex, flex.flexGapM, styles.modalButtons)}>
                            <Button
                                onClick={() => setShowDeleteConfirm(false)}
                                disabled={isDeleting}
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleDelete}
                                disabled={isDeleting}
                                style={{ background: 'var(--danger)', color: 'white' }}
                            >
                                {isDeleting ? 'Deleting...' : 'Delete Glyph'}
                            </Button>
                        </div>
                    </div>
                ) : (
                    <SmartForm
                        {...formProps}
                        registerField={registerField}
                        unregisterField={unregisterField}
                        isFormValid={isFormValid}
                        className={classNames(flex.flexCol, flex.flexGapM)}
                    >
                        <GlyphFormFields
                            registerField={registerField}
                            mode="edit"
                            initialData={glyph}
                        />

                        <div className={classNames(flex.flex, flex.flexGapM, styles.modalButtons)}>
                            <IconButton
                                className={classNames(buttonStyles.primary)}
                                type="submit"
                                disabled={isSubmitting}
                            >
                                {isSubmitting ? 'Saving...' : 'Save Changes'}
                            </IconButton>
                            <IconButton
                                className={classNames(buttonStyles.secondary)}
                                onClick={handleClose}
                                type="button"
                                disabled={isSubmitting}
                            >
                                Cancel
                            </IconButton>
                            {showDelete && (
                                <IconButton
                                    className={classNames(buttonStyles.danger)}
                                    type="button"
                                    iconName="trash"
                                    onClick={() => setShowDeleteConfirm(true)}
                                    disabled={isSubmitting}
                                >
                                    Delete
                                </IconButton>
                            )}
                        </div>
                    </SmartForm>
                )}
            </div>
        </Modal>
    );
}
