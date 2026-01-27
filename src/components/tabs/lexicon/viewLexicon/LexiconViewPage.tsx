/**
 * LexiconViewPage
 * ----------------
 * Page for viewing and editing a lexicon entry.
 * Includes etymology tree display.
 */

import { useState, useCallback, useRef, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useEtymolog } from '../../../../db';
import type { UpdateLexiconInput, LexiconAncestorFormRow, LexiconComplete } from '../../../../db/types';
import { SmartForm, useSmartForm } from 'smart-form/smartForm';
import type { useSmartFormRef } from 'smart-form/types';
import { LexiconFormFields } from '../../../form/lexiconForm';
import { DetailedLexiconDisplay } from '../../../display/lexicon/detailed';
import { EtymologyTree } from '../../../display/lexicon/etymologyTree';
import IconButton from 'cyber-components/interactable/buttons/iconButton/iconButton.tsx';
import Button from 'cyber-components/interactable/buttons/button/button.tsx';
import { buttonStyles } from 'cyber-components/interactable/buttons/button/button.tsx';
import Modal from 'cyber-components/container/modal/modal.tsx';
import { ProcessingLockModalProvider } from 'cyber-components/graphics/loading/processingLockModal/processingLockModal';
import classNames from 'classnames';
import { flex, sizing } from "utils-styles";
import styles from './LexiconViewPage.module.scss';

export default function LexiconViewPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { api, data, refresh, isLoading, error } = useEtymolog();

    const [isEditing, setIsEditing] = useState(false);
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteWarning, setDeleteWarning] = useState<string | null>(null);

    const { registerField, registerForm, isFormValid } = useSmartForm({ mode: 'onChange' });
    const smartFormRef = useRef<useSmartFormRef>(null);

    // Track complex field values for edit mode
    const [spellingIds, setSpellingIds] = useState<number[]>([]);
    const [ancestors, setAncestors] = useState<LexiconAncestorFormRow[]>([]);

    // Parse ID
    const lexiconId = id ? parseInt(id, 10) : null;

    // Build grapheme map for display
    const graphemeMap = useMemo(() => {
        return new Map((data.graphemeComplete ?? []).map(g => [g.id, g]));
    }, [data.graphemeComplete]);

    // Get lexicon data
    const lexiconResult = lexiconId && !isNaN(lexiconId)
        ? api.lexicon.getByIdComplete(lexiconId)
        : null;

    const lexicon: LexiconComplete | null = lexiconResult?.success ? lexiconResult.data ?? null : null;

    // Get ancestry tree
    const ancestryTreeResult = lexiconId && !isNaN(lexiconId)
        ? api.lexicon.getAncestryTree(lexiconId, 3)
        : null;

    const ancestryTree = ancestryTreeResult?.success ? ancestryTreeResult.data ?? null : null;

    // Initialize edit state when entering edit mode
    const handleStartEdit = useCallback(() => {
        if (lexicon) {
            setSpellingIds(lexicon.spelling.map(g => g.id));
            setAncestors(lexicon.ancestors.map(a => ({
                ancestorId: a.ancestor.id,
                ancestryType: a.ancestry_type,
            })));
        }
        setIsEditing(true);
    }, [lexicon]);

    const handleCancelEdit = useCallback(() => {
        setIsEditing(false);
    }, []);

    // Form submission handler for edit
    const handleSubmit = useCallback(async (formData: Record<string, unknown>) => {
        if (!lexiconId) return { success: false, error: 'No lexicon ID' };

        try {
            const lemma = formData.lemma as string;
            const pronunciation = formData.pronunciation as string | undefined;
            const meaning = formData.meaning as string | undefined;
            const partOfSpeech = formData.partOfSpeech as string | undefined;
            const notes = formData.notes as string | undefined;

            // Update basic fields
            const updateInput: UpdateLexiconInput = {
                lemma: lemma.trim(),
                pronunciation: pronunciation?.trim() || null,
                meaning: meaning?.trim() || null,
                part_of_speech: partOfSpeech?.trim() || null,
                notes: notes?.trim() || null,
            };

            const updateResult = api.lexicon.update(lexiconId, updateInput);
            if (!updateResult.success) {
                throw new Error(updateResult.error?.message || 'Failed to update');
            }

            // Update spelling
            const spellingResult = api.lexicon.updateSpelling(lexiconId, {
                spelling: spellingIds.map((gid, idx) => ({
                    grapheme_id: gid,
                    position: idx,
                })),
            });
            if (!spellingResult.success) {
                console.warn('Failed to update spelling:', spellingResult.error?.message);
            }

            // Update ancestry
            const ancestryResult = api.lexicon.updateAncestry(lexiconId, {
                ancestry: ancestors.map((a, idx) => ({
                    ancestor_id: a.ancestorId,
                    position: idx,
                    ancestry_type: a.ancestryType,
                })),
            });
            if (!ancestryResult.success) {
                console.warn('Failed to update ancestry:', ancestryResult.error?.message);
            }

            refresh();
            setIsEditing(false);

            return { success: true };
        } catch (err) {
            console.error('Failed to update lexicon:', err);
            return {
                success: false,
                error: err instanceof Error ? err.message : 'Update failed',
            };
        }
    }, [api, lexiconId, spellingIds, ancestors, refresh]);

    const formProps = registerForm('editLexiconForm', {
        submitFunc: handleSubmit,
    });

    // Delete handlers
    const handleDeleteClick = useCallback(() => {
        if (lexicon) {
            const descendantCount = lexicon.descendants?.length ?? 0;
            if (descendantCount > 0) {
                const names = lexicon.descendants.slice(0, 3).map(d => d.descendant.lemma).join(', ');
                const more = descendantCount > 3 ? ` and ${descendantCount - 3} more` : '';
                setDeleteWarning(
                    `This word has ${descendantCount} descendant${descendantCount !== 1 ? 's' : ''}: ${names}${more}. ` +
                    `Deleting it will remove etymology links from those words.`
                );
            } else {
                setDeleteWarning(null);
            }
        }
        setDeleteModalOpen(true);
    }, [lexicon]);

    const confirmDelete = useCallback(async () => {
        if (!lexiconId) return;

        setIsDeleting(true);
        try {
            const result = api.lexicon.delete(lexiconId);
            if (result.success) {
                refresh();
                navigate('/lexicon');
            } else {
                console.error('Delete failed:', result.error?.message);
            }
        } catch (err) {
            console.error('Delete failed:', err);
        } finally {
            setIsDeleting(false);
            setDeleteModalOpen(false);
        }
    }, [api, lexiconId, refresh, navigate]);

    // Handle tree node click
    const handleTreeNodeClick = useCallback((nodeId: number) => {
        navigate(`/lexicon/db/${nodeId}`);
    }, [navigate]);

    // Loading and error states
    if (isLoading) {
        return <div className={styles.loading}>Loading...</div>;
    }

    if (error) {
        return <div className={styles.error}>Error: {error.message}</div>;
    }

    if (!lexiconId || isNaN(lexiconId)) {
        return (
            <div className={styles.notFound}>
                <p>Invalid lexicon ID</p>
                <Link to="/lexicon">Back to Lexicon</Link>
            </div>
        );
    }

    if (!lexicon) {
        return (
            <div className={styles.notFound}>
                <p>Lexicon entry not found</p>
                <Link to="/lexicon">Back to Lexicon</Link>
            </div>
        );
    }

    return (
        <ProcessingLockModalProvider>
            <div className={classNames(styles.viewPage, flex.flexColumn, sizing.parentSize)}>
                {/* Header */}
                <div className={styles.header}>
                    <IconButton
                        as={Link}
                        to="/lexicon"
                        iconName="arrow-left"
                        aria-label="Back to Lexicon"
                    />
                    <h2 className={styles.title}>{lexicon.lemma}</h2>
                    <div className={styles.headerActions}>
                        {!isEditing && (
                            <>
                                <IconButton
                                    iconName="pencil"
                                    onClick={handleStartEdit}
                                    aria-label="Edit"
                                >
                                    Edit
                                </IconButton>
                                <IconButton
                                    iconName="trash"
                                    iconColor="var(--status-bad)"
                                    onClick={handleDeleteClick}
                                    aria-label="Delete"
                                >
                                    Delete
                                </IconButton>
                            </>
                        )}
                    </div>
                </div>

                {/* Content */}
                <div className={styles.content}>
                    {isEditing ? (
                        /* Edit Mode */
                        <SmartForm
                            ref={smartFormRef}
                            {...formProps}
                            registerField={registerField}
                            isFormValid={isFormValid}
                            className={styles.formContainer}
                        >
                            <LexiconFormFields
                                registerField={registerField}
                                mode="edit"
                                initialData={lexicon}
                                onSpellingChange={setSpellingIds}
                                onAncestorsChange={setAncestors}
                            />

                            <div className={styles.editActions}>
                                <Button
                                    type="button"
                                    onClick={handleCancelEdit}
                                    className={buttonStyles.secondary}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    className={buttonStyles.primary}
                                    disabled={!isFormValid}
                                >
                                    Save Changes
                                </Button>
                            </div>
                        </SmartForm>
                    ) : (
                        /* View Mode */
                        <>
                            <section className={styles.displaySection}>
                                <DetailedLexiconDisplay
                                    lexiconData={lexicon}
                                    graphemeMap={graphemeMap}
                                    showAncestry={false}
                                />
                            </section>

                            {/* Etymology Tree */}
                            {ancestryTree && (
                                <section className={styles.etymologySection}>
                                    <h3 className={styles.sectionTitle}>Etymology Tree</h3>
                                    <EtymologyTree
                                        rootNode={ancestryTree}
                                        direction="ancestors"
                                        maxDepth={3}
                                        onNodeClick={handleTreeNodeClick}
                                        currentWordId={lexiconId}
                                    />
                                </section>
                            )}

                            {/* Descendants */}
                            {lexicon.descendants && lexicon.descendants.length > 0 && (
                                <section className={styles.descendantsSection}>
                                    <h3 className={styles.sectionTitle}>
                                        Descendants ({lexicon.descendants.length})
                                    </h3>
                                    <div className={styles.descendantsList}>
                                        {lexicon.descendants.map(d => (
                                            <Link
                                                key={d.descendant.id}
                                                to={`/lexicon/db/${d.descendant.id}`}
                                                className={styles.descendantItem}
                                            >
                                                <span className={styles.descendantType}>{d.ancestry_type}</span>
                                                <span className={styles.descendantLemma}>{d.descendant.lemma}</span>
                                            </Link>
                                        ))}
                                    </div>
                                </section>
                            )}
                        </>
                    )}
                </div>

                {/* Delete Confirmation Modal */}
                <Modal
                    isOpen={deleteModalOpen}
                    setIsOpen={setDeleteModalOpen}
                    onClose={() => setDeleteModalOpen(false)}
                    allowClose={!isDeleting}
                >
                    <div className={styles.deleteModal}>
                        <h2>Delete Word</h2>
                        <p>Are you sure you want to delete <strong>{lexicon.lemma}</strong>?</p>

                        {deleteWarning && (
                            <div className={styles.deleteWarning}>
                                <strong>Warning:</strong> {deleteWarning}
                            </div>
                        )}

                        <div className={styles.deleteActions}>
                            <Button
                                onClick={() => setDeleteModalOpen(false)}
                                disabled={isDeleting}
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={confirmDelete}
                                disabled={isDeleting}
                                style={{ background: 'var(--danger)', color: 'white' }}
                            >
                                {isDeleting ? 'Deleting...' : 'Delete Word'}
                            </Button>
                        </div>
                    </div>
                </Modal>
            </div>
        </ProcessingLockModalProvider>
    );
}
