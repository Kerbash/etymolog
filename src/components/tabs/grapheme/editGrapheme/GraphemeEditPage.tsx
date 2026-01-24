/**
 * GraphemeEditPage
 * -----------------
 * Page component for editing an existing grapheme.
 * Accessible at /script-maker/grapheme/db/:id
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import classNames from "classnames";

import { SmartForm, useSmartForm } from "smart-form/smartForm";
import IconButton from "cyber-components/interactable/buttons/iconButton/iconButton.tsx";
import { buttonStyles } from "cyber-components/interactable/buttons/button/button";
import Modal from "cyber-components/container/modal/modal.tsx";
import Button from "cyber-components/interactable/buttons/button/button.tsx";

import { useEtymolog, type Glyph } from "../../../../db";
import { GraphemeFormFields, type GraphemeFormData } from "../../../form/graphemeForm";
import { flex, graphic } from "utils-styles";
import styles from "./graphemeEditPage.module.scss";

export default function GraphemeEditPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { api, isLoading, error } = useEtymolog();
    const { registerField, unregisterField, registerForm, isFormValid } = useSmartForm({ mode: "onChange" });

    const [submitError, setSubmitError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const isSubmittingRef = useRef(false);
    const [selectedGlyphs, setSelectedGlyphs] = useState<Glyph[]>([]);
    const initializedGlyphsRef = useRef(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const graphemeId = id ? parseInt(id, 10) : null;
    const graphemeResult = graphemeId ? api.grapheme.getByIdComplete(graphemeId) : null;
    const graphemeData = graphemeResult?.success ? graphemeResult.data : null;

    // Initialize selectedGlyphs from graphemeData when it becomes available
    // Using useEffect to avoid "setState during render" warning
    useEffect(() => {
        if (graphemeData && !initializedGlyphsRef.current) {
            initializedGlyphsRef.current = true;
            setSelectedGlyphs(graphemeData.glyphs);
        }
    }, [graphemeData]);

    const formProps = registerForm("editGraphemeForm", {
        submitFunc: async (formData) => {
            if (isSubmittingRef.current || !graphemeId) return { success: false, error: 'Invalid state' };
            isSubmittingRef.current = true;
            setIsSubmitting(true);

            try {
                setSubmitError(null);
                const data = formData as unknown as GraphemeFormData;

                if (selectedGlyphs.length === 0) throw new Error('Please add at least one glyph');
                if (!data.graphemeName?.trim()) throw new Error('Grapheme name is required');

                const updateResult = api.grapheme.update(graphemeId, {
                    name: data.graphemeName.trim(),
                    category: data.category?.trim() || undefined,
                    notes: data.notes?.trim() || undefined,
                });
                if (!updateResult.success) throw new Error(updateResult.error?.message || 'Failed to update');

                api.grapheme.updateGlyphs(graphemeId, {
                    glyphs: selectedGlyphs.map((g, i) => ({ glyph_id: g.id, position: i })),
                });

                api.phoneme.deleteAllForGrapheme(graphemeId);
                const validPhonemes = data.pronunciations?.filter(p => p.pronunciation?.trim()) || [];
                for (const p of validPhonemes) {
                    api.phoneme.add({ grapheme_id: graphemeId, phoneme: p.pronunciation.trim(), use_in_auto_spelling: p.useInAutoSpelling });
                }

                navigate('/script-maker');
                return { success: true };
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Failed to update grapheme';
                setSubmitError(msg);
                return { success: false, error: msg };
            } finally {
                isSubmittingRef.current = false;
                setIsSubmitting(false);
            }
        }
    });

    const handleDelete = useCallback(async () => {
        if (!graphemeId || isDeleting) return;
        setIsDeleting(true);
        try {
            const result = api.grapheme.delete(graphemeId);
            if (!result.success) throw new Error(result.error?.message);
            setShowDeleteModal(false);
            navigate('/script-maker');
        } catch (err) {
            setSubmitError(err instanceof Error ? err.message : 'Failed to delete');
        } finally {
            setIsDeleting(false);
        }
    }, [graphemeId, api.grapheme, navigate, isDeleting]);

    if (isLoading) return <div className={styles.pageContainer}><p>Loading...</p></div>;
    if (error) return <div className={styles.pageContainer}><p className={styles.errorMessage}>Error: {error.message}</p><IconButton as={Link} to="/script-maker" iconName="arrow-left">Back</IconButton></div>;
    if (!graphemeData) return <div className={styles.pageContainer}><p className={styles.errorMessage}>Grapheme not found</p><IconButton as={Link} to="/script-maker" iconName="arrow-left">Back</IconButton></div>;

    return (
        <div className={styles.pageContainer}>
            <nav className={classNames(flex.flexRow, flex.flexGapM, styles.nav)}>
                <IconButton as={Link} to="/script-maker" iconName="arrow-left">Back to Gallery</IconButton>
            </nav>
            <h2 className={graphic.underlineHighlightColorPrimary}>Edit Grapheme: {graphemeData.name}</h2>
            {submitError && <div className={styles.errorMessage}>{submitError}</div>}

            <SmartForm {...formProps} registerField={registerField} unregisterField={unregisterField} isFormValid={isFormValid} className={styles.formContainer}>
                <GraphemeFormFields registerField={registerField} mode="edit" initialData={graphemeData} selectedGlyphs={selectedGlyphs} onSelectedGlyphsChange={setSelectedGlyphs} />
                <div className={classNames(flex.flex, flex.flexGapM, styles.buttonRow)}>
                    <IconButton className={buttonStyles.primary} type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : 'Save Changes'}</IconButton>
                    <IconButton className={buttonStyles.secondary} type="button" onClick={() => navigate('/script-maker')}>Cancel</IconButton>
                    <IconButton className={classNames(buttonStyles.danger, styles.deleteButton)} type="button" iconName="trash" onClick={() => setShowDeleteModal(true)}>Delete</IconButton>
                </div>
            </SmartForm>

            <Modal isOpen={showDeleteModal} setIsOpen={setShowDeleteModal} onClose={() => setShowDeleteModal(false)} allowClose={!isDeleting}>
                <div className={styles.modalContent}>
                    <h2 style={{ marginTop: 0 }}>Delete Grapheme</h2>
                    <p>Are you sure you want to delete "{graphemeData.name}"?</p>
                    <p className={styles.warningText}>This will also delete all associated pronunciations.</p>
                    <div className={classNames(flex.flex, flex.flexGapM, styles.modalButtons)}>
                        <Button onClick={() => setShowDeleteModal(false)} disabled={isDeleting}>Cancel</Button>
                        <Button onClick={handleDelete} disabled={isDeleting} style={{ background: 'var(--danger)', color: 'white' }}>{isDeleting ? 'Deleting...' : 'Delete'}</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
