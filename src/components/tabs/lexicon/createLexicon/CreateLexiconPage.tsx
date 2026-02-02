/**
 * CreateLexiconPage
 * ----------------
 * Page for creating a new lexicon entry.
 * Supports Two-List Architecture for saving IPA fallback characters.
 */

import { useState, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useEtymolog } from '../../../../db';
import type { CreateLexiconInput, LexiconAncestorFormRow } from '../../../../db/types';
import type { SpellingEntry } from '../../../../db/utils/spellingUtils';
import { SmartForm, useSmartForm } from 'smart-form/smartForm';
import type { useSmartFormRef } from 'smart-form/types';
import { LexiconFormFields } from '../../../form/lexiconForm';
import IconButton from 'cyber-components/interactable/buttons/iconButton/iconButton.tsx';
import Button from 'cyber-components/interactable/buttons/button/button.tsx';
import { buttonStyles } from 'cyber-components/interactable/buttons/button/button.tsx';
import { ProcessingLockModalProvider } from 'cyber-components/graphics/loading/processingLockModal/processingLockModal';
import classNames from 'classnames';
import { flex, sizing } from "utils-styles";
import styles from './CreateLexiconPage.module.scss';

export default function CreateLexiconPage() {
    const navigate = useNavigate();
    const { api, refresh, isLoading, error } = useEtymolog();

    const { registerField, registerForm, isFormValid } = useSmartForm({ mode: 'onChange' });
    const smartFormRef = useRef<useSmartFormRef>(null);

    // Track complex field values
    // glyph_order is the primary format for Two-List Architecture
    const [glyphOrder, setGlyphOrder] = useState<SpellingEntry[]>([]);
    const [ancestors, setAncestors] = useState<LexiconAncestorFormRow[]>([]);
    const [isNative, setIsNative] = useState(true);
    const [autoSpell, setAutoSpell] = useState(true);

    // Form submission handler
    const handleSubmit = useCallback(async (formData: Record<string, unknown>) => {
        try {
            // Extract form values; lemma input removed - derive from pronunciation if needed
            const pronunciation = formData.pronunciation as string | undefined;
            const meaning = formData.meaning as string | undefined;
            const partOfSpeech = formData.partOfSpeech as string | undefined;
            const notes = formData.notes as string | undefined;

            // Build create input using glyph_order format (Two-List Architecture)
            // This supports both real graphemes AND IPA fallback characters
            const input: CreateLexiconInput = {
                pronunciation: pronunciation?.trim() || undefined,
                is_native: isNative,
                auto_spell: autoSpell,
                meaning: meaning?.trim() || undefined,
                part_of_speech: partOfSpeech?.trim() || undefined,
                notes: notes?.trim() || undefined,
                // Use glyph_order format - supports IPA fallback characters
                glyph_order: glyphOrder,
                ancestry: ancestors.map((a, idx) => ({
                    ancestor_id: a.ancestorId,
                    position: idx,
                    ancestry_type: a.ancestryType,
                })),
            };

            // Create via API
            const result = api.lexicon.create(input);

            if (!result.success) {
                throw new Error(result.error?.message || 'Failed to create lexicon entry');
            }

            // Refresh data and navigate to view page
            refresh();
            navigate(`/lexicon/db/${result.data?.id}`);

            return { success: true, data: result.data };
        } catch (err) {
            console.error('Failed to create lexicon entry:', err);
            return {
                success: false,
                error: err instanceof Error ? err.message : 'Creation failed',
            };
        }
    }, [api, refresh, navigate, glyphOrder, ancestors, isNative, autoSpell]);

    // Register form
    const formProps = registerForm('createLexiconForm', {
        submitFunc: handleSubmit,
    });

    // Handle checkbox changes via event delegation
    const handleCheckboxChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, checked } = e.target;
        if (name === 'isNativeCheckbox') {
            setIsNative(checked);
            if (!checked) {
                setAutoSpell(false);
            }
        } else if (name === 'autoSpellCheckbox') {
            setAutoSpell(checked);
        }
    }, []);

    if (isLoading) {
        return <div className={styles.loading}>Loading...</div>;
    }

    if (error) {
        return <div className={styles.error}>Error: {error.message}</div>;
    }

    return (
        <ProcessingLockModalProvider>
            <div className={classNames(styles.createPage, flex.flexColumn, sizing.parentSize)}>
                {/* Header */}
                <div className={styles.header}>
                    <IconButton
                        as={Link}
                        to="/lexicon"
                        iconName="arrow-left"
                        aria-label="Back to Lexicon"
                    />
                    <h2 className={styles.title}>Create New Word</h2>
                </div>

                {/* Form */}
                <SmartForm
                    ref={smartFormRef}
                    {...formProps}
                    registerField={registerField}
                    isFormValid={isFormValid}
                    className={styles.formContainer}
                >
                    <LexiconFormFields
                        registerField={registerField}
                        mode="create"
                        onGlyphOrderChange={setGlyphOrder}
                        onAncestorsChange={setAncestors}
                    />

                    {/* Hidden checkboxes for state sync */}
                    <div style={{ display: 'none' }}>
                        <input
                            type="checkbox"
                            name="isNativeCheckbox"
                            checked={isNative}
                            onChange={handleCheckboxChange}
                        />
                        <input
                            type="checkbox"
                            name="autoSpellCheckbox"
                            checked={autoSpell}
                            onChange={handleCheckboxChange}
                        />
                    </div>

                    {/* Actions */}
                    <div className={styles.actions}>
                        <Button
                            as={Link}
                            to="/lexicon"
                            className={buttonStyles.secondary}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            className={buttonStyles.primary}
                            disabled={!isFormValid}
                        >
                            Create Word
                        </Button>
                    </div>
                </SmartForm>
            </div>
        </ProcessingLockModalProvider>
    );
}
