/**
 * GlyphEditPage
 * --------------
 * Page component for editing an existing glyph.
 * Accessible at /script-maker/glyphs/db/:id
 *
 * Features:
 * - Loads glyph by ID
 * - Uses shared GlyphFormFields
 * - Update and delete functionality
 * - Navigation back to gallery
 */

import { useState, useRef, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import classNames from "classnames";

import { SmartForm, useSmartForm } from "smart-form/smartForm";
import IconButton from "cyber-components/interactable/buttons/iconButton/iconButton.tsx";
import { buttonStyles } from "cyber-components/interactable/buttons/button/button";
import Modal from "cyber-components/container/modal/modal.tsx";
import Button from "cyber-components/interactable/buttons/button/button.tsx";

import { useEtymolog } from "../../../../db";
import { GlyphFormFields, type GlyphFormData } from "../../../form/glyphForm";
import CompactGraphemeDisplay from "../../../display/grapheme/compact/compact";
import { flex, graphic } from "utils-styles";
import styles from "./glyphEditPage.module.scss";

export default function GlyphEditPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { api, data, isLoading, error } = useEtymolog();
    const { registerField, unregisterField, registerForm, isFormValid } = useSmartForm({ mode: "onChange" });

    const [submitError, setSubmitError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const isSubmittingRef = useRef(false);

    // Delete modal state
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const glyphId = id ? parseInt(id, 10) : null;

    // Get the glyph data
    const glyph = glyphId ? api.glyph.getById(glyphId) : null;
    const glyphData = glyph?.success ? glyph.data : null;

    // Get graphemes that use this glyph (for delete warning)
    const graphemesByGlyph = data.graphemesComplete?.filter(g =>
        g.glyphs.some(gl => gl.id === glyphId)
    ) || [];

    // Form submission handler
    const formProps = registerForm("editGlyphForm", {
        submitFunc: async (formData) => {
            if (isSubmittingRef.current || !glyphId) {
                return { success: false, error: 'Invalid state' };
            }
            isSubmittingRef.current = true;
            setIsSubmitting(true);

            try {
                setSubmitError(null);

                const data = formData as unknown as GlyphFormData;

                // Validate required fields
                if (!data.glyphSvg || data.glyphSvg.trim() === '') {
                    throw new Error('Please draw a glyph');
                }
                if (!data.glyphName || data.glyphName.trim() === '') {
                    throw new Error('Glyph name is required');
                }

                // Update the glyph via API
                const result = api.glyph.update(glyphId, {
                    name: data.glyphName.trim(),
                    svg_data: data.glyphSvg,
                    category: data.category?.trim() || undefined,
                    notes: data.notes?.trim() || undefined
                });

                if (!result.success) {
                    throw new Error(result.error?.message || 'Failed to update glyph');
                }

                console.log("[GlyphEditPage] Updated glyph:", result.data);

                // Navigate back to gallery
                navigate('/script-maker/glyphs');

                return { success: true, data: result.data };
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : 'Failed to update glyph';
                setSubmitError(errorMessage);
                console.error("[GlyphEditPage] Error:", err);
                return { success: false, error: errorMessage };
            } finally {
                isSubmittingRef.current = false;
                setIsSubmitting(false);
            }
        }
    });

    // Delete handler
    const handleDelete = useCallback(async () => {
        if (!glyphId || isDeleting) return;

        setIsDeleting(true);
        try {
            const result = api.glyph.cascadeDelete(glyphId);
            if (!result.success) {
                throw new Error(result.error?.message || 'Failed to delete glyph');
            }

            setShowDeleteModal(false);
            navigate('/script-maker/glyphs');
        } catch (err) {
            console.error('[GlyphEditPage] Delete error:', err);
            setSubmitError(err instanceof Error ? err.message : 'Failed to delete glyph');
        } finally {
            setIsDeleting(false);
        }
    }, [glyphId, api.glyph, navigate, isDeleting]);

    // Loading state
    if (isLoading) {
        return (
            <div className={styles.pageContainer}>
                <p>Loading...</p>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div className={styles.pageContainer}>
                <p className={styles.errorMessage}>Error: {error.message}</p>
                <IconButton as={Link} to="/script-maker/glyphs" iconName="arrow-left">
                    Back to Gallery
                </IconButton>
            </div>
        );
    }

    // Not found state
    if (!glyphData) {
        return (
            <div className={styles.pageContainer}>
                <p className={styles.errorMessage}>Glyph not found</p>
                <IconButton as={Link} to="/script-maker/glyphs" iconName="arrow-left">
                    Back to Gallery
                </IconButton>
            </div>
        );
    }

    return (
        <div className={styles.pageContainer}>
            {/* Navigation */}
            <nav className={classNames(flex.flexRow, flex.flexGapM, styles.nav)}>
                <IconButton
                    as={Link}
                    to="/script-maker/glyphs"
                    iconName="arrow-left"
                >
                    Back to Gallery
                </IconButton>
            </nav>

            <h2 className={graphic.underlineHighlightColorPrimary}>
                Edit Glyph: {glyphData.name}
            </h2>

            {submitError && (
                <div className={styles.errorMessage}>
                    {submitError}
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
                    mode="edit"
                    initialData={glyphData}
                />

                <div className={classNames(flex.flex, flex.flexGapM, styles.buttonRow)}>
                    <IconButton
                        className={classNames(buttonStyles.primary)}
                        type="submit"
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? 'Saving...' : 'Save Changes'}
                    </IconButton>
                    <IconButton
                        className={classNames(buttonStyles.secondary)}
                        type="button"
                        onClick={() => navigate('/script-maker/glyphs')}
                    >
                        Cancel
                    </IconButton>
                    <IconButton
                        className={classNames(buttonStyles.danger, styles.deleteButton)}
                        type="button"
                        iconName="trash"
                        onClick={() => setShowDeleteModal(true)}
                    >
                        Delete
                    </IconButton>
                </div>
            </SmartForm>

            {/* Delete Confirmation Modal */}
            <Modal
                isOpen={showDeleteModal}
                setIsOpen={setShowDeleteModal}
                onClose={() => setShowDeleteModal(false)}
                allowClose={!isDeleting}
            >
                <div className={styles.modalContent}>
                    <h2 style={{ marginTop: 0 }}>Delete Glyph</h2>
                    <p>
                        Are you sure you want to delete "{glyphData.name}"?
                    </p>

                    {graphemesByGlyph.length > 0 && (
                        <>
                            <p className={styles.warningText}>
                                ⚠️ The following grapheme(s) use this glyph and will also be deleted:
                            </p>
                            <div className={styles.graphemeList}>
                                {graphemesByGlyph.map((g) => (
                                    <CompactGraphemeDisplay key={g.id} graphemeData={g} />
                                ))}
                            </div>
                        </>
                    )}

                    <div className={classNames(flex.flex, flex.flexGapM, styles.modalButtons)}>
                        <Button onClick={() => setShowDeleteModal(false)} disabled={isDeleting}>
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
            </Modal>
        </div>
    );
}
