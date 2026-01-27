'use client';

import styles from "./SpellingInput.module.scss";
import classNames from "classnames";
import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import type { registerFieldReturnType } from "smart-form/types";
import type { GraphemeComplete } from "../../../../db/types";
import type { AutoSpellResult } from "../../../../db/autoSpellService";
import IconButton from "cyber-components/interactable/buttons/iconButton/iconButton.tsx";
import HoverToolTip from "cyber-components/interactable/information/hoverToolTip/hoverToolTip.tsx";
import Modal from "cyber-components/container/modal/modal.tsx";
import DOMPurify from 'dompurify';

/** Types -------------------------------------- */

export interface SpellingInputProps extends registerFieldReturnType {
    availableGraphemes: GraphemeComplete[];
    defaultValue?: number[];
    autoSpellPreview?: AutoSpellResult | null;
    onRequestAutoSpell?: () => void;
    className?: string;
}

/** Component -------------------------------------- */

export const SpellingInput = forwardRef((
    {
        registerSmartFieldProps,
        fieldState,
        availableGraphemes,
        defaultValue = [],
        autoSpellPreview,
        onRequestAutoSpell,
        className,
    }: SpellingInputProps,
    _
) => {
    const idPrefix = useId();
    const isInitialRender = useRef(true);
    const fieldStateRef = useRef(fieldState);
    fieldStateRef.current = fieldState;

    // Selected grapheme IDs in order
    const [selectedIds, setSelectedIds] = useState<number[]>(defaultValue);

    // Modal state for grapheme picker
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Build grapheme lookup map
    const graphemeMap = new Map(availableGraphemes.map(g => [g.id, g]));

    // Expose value via useImperativeHandle
    useImperativeHandle(registerSmartFieldProps.ref, () => ({
        get value(): number[] {
            return selectedIds;
        }
    }), [selectedIds]);

    // Update parent field state when selection changes
    useEffect(() => {
        if (isInitialRender.current) {
            isInitialRender.current = false;
            return;
        }

        fieldStateRef.current.isTouched.setIsTouched(true);
        fieldStateRef.current.isChanged.setIsChanged(true);
        fieldStateRef.current.isEmpty.setIsEmpty(selectedIds.length === 0);
        fieldStateRef.current.isInputValid.setIsInputValid(true);
    }, [selectedIds]);

    // Add grapheme to selection
    const handleAddGrapheme = useCallback((graphemeId: number) => {
        setSelectedIds(prev => [...prev, graphemeId]);
    }, []);

    // Remove grapheme from selection
    const handleRemoveGrapheme = useCallback((index: number) => {
        setSelectedIds(prev => prev.filter((_, i) => i !== index));
    }, []);

    // Move grapheme up in order
    const handleMoveUp = useCallback((index: number) => {
        if (index === 0) return;
        setSelectedIds(prev => {
            const newIds = [...prev];
            [newIds[index - 1], newIds[index]] = [newIds[index], newIds[index - 1]];
            return newIds;
        });
    }, []);

    // Move grapheme down in order
    const handleMoveDown = useCallback((index: number) => {
        setSelectedIds(prev => {
            if (index >= prev.length - 1) return prev;
            const newIds = [...prev];
            [newIds[index], newIds[index + 1]] = [newIds[index + 1], newIds[index]];
            return newIds;
        });
    }, []);

    // Apply auto-spell preview
    const handleApplyAutoSpell = useCallback(() => {
        if (autoSpellPreview?.success && autoSpellPreview.spelling) {
            const newIds = autoSpellPreview.spelling.map(s => s.grapheme_id);
            setSelectedIds(newIds);
        }
    }, [autoSpellPreview]);

    // Filter available graphemes by search
    const filteredGraphemes = availableGraphemes.filter(g => {
        if (!searchQuery.trim()) return true;
        const query = searchQuery.toLowerCase();
        return (
            g.name.toLowerCase().includes(query) ||
            g.phonemes.some(p => p.phoneme.toLowerCase().includes(query))
        );
    });

    // Render a mini grapheme card
    const renderGraphemeCard = (grapheme: GraphemeComplete, index?: number, showControls = true) => {
        const combinedSvg = grapheme.glyphs
            .map(glyph => glyph.svg_data)
            .join('');
        const sanitizedSvg = DOMPurify.sanitize(combinedSvg, {
            USE_PROFILES: { svg: true, svgFilters: true },
        });

        return (
            <div key={`${idPrefix}-${grapheme.id}-${index ?? 0}`} className={styles.graphemeCard}>
                <div
                    className={styles.graphemeSvg}
                    dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
                />
                <span className={styles.graphemeName}>{grapheme.name}</span>
                {showControls && index !== undefined && (
                    <div className={styles.graphemeControls}>
                        <IconButton
                            iconName="chevron-up"
                            onClick={() => handleMoveUp(index)}
                            disabled={index === 0}
                            iconSize="0.75rem"
                            themeType="basic"
                        />
                        <IconButton
                            iconName="chevron-down"
                            onClick={() => handleMoveDown(index)}
                            disabled={index >= selectedIds.length - 1}
                            iconSize="0.75rem"
                            themeType="basic"
                        />
                        <IconButton
                            iconName="x"
                            onClick={() => handleRemoveGrapheme(index)}
                            iconColor="var(--status-bad)"
                            iconSize="0.75rem"
                            themeType="basic"
                        />
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className={classNames(styles.spellingInput, className)}>
            <div className={styles.header}>
                <span className={styles.label}>Spelling</span>
                <div className={styles.actions}>
                    {onRequestAutoSpell && (
                        <HoverToolTip content="Generate spelling from pronunciation">
                            <IconButton
                                iconName="magic"
                                onClick={onRequestAutoSpell}
                                iconSize="1rem"
                                themeType="basic"
                            >
                                Auto-spell
                            </IconButton>
                        </HoverToolTip>
                    )}
                    <IconButton
                        iconName="plus-circle"
                        onClick={() => setIsPickerOpen(true)}
                        iconColor="var(--green)"
                        iconSize="1.25rem"
                        themeType="basic"
                    >
                        Add
                    </IconButton>
                </div>
            </div>

            {/* Auto-spell preview */}
            {autoSpellPreview && (
                <div className={classNames(
                    styles.autoSpellPreview,
                    autoSpellPreview.success ? styles.success : styles.error
                )}>
                    {autoSpellPreview.success ? (
                        <>
                            <span className={styles.previewLabel}>Auto-spell suggestion:</span>
                            <div className={styles.previewGraphemes}>
                                {autoSpellPreview.spelling?.map((s, i) => {
                                    const grapheme = graphemeMap.get(s.grapheme_id);
                                    if (!grapheme) return null;
                                    return renderGraphemeCard(grapheme, i, false);
                                })}
                            </div>
                            {autoSpellPreview.unmatchedParts && autoSpellPreview.unmatchedParts.length > 0 && (
                                <div className={styles.unmatched}>
                                    Unmatched: {autoSpellPreview.unmatchedParts.join(', ')}
                                </div>
                            )}
                            <IconButton
                                iconName="check"
                                onClick={handleApplyAutoSpell}
                                iconColor="var(--green)"
                                themeType="basic"
                            >
                                Apply
                            </IconButton>
                        </>
                    ) : (
                        <span className={styles.errorText}>{autoSpellPreview.error}</span>
                    )}
                </div>
            )}

            {/* Selected graphemes */}
            <div className={styles.selectedContainer}>
                {selectedIds.length > 0 ? (
                    <div className={styles.selectedGraphemes}>
                        {selectedIds.map((id, index) => {
                            const grapheme = graphemeMap.get(id);
                            if (!grapheme) return null;
                            return renderGraphemeCard(grapheme, index, true);
                        })}
                    </div>
                ) : (
                    <div className={styles.emptyState}>
                        No graphemes selected. Click "Add" to select graphemes for the word's spelling.
                    </div>
                )}
            </div>

            {/* Grapheme picker modal */}
            <Modal
                isOpen={isPickerOpen}
                setIsOpen={setIsPickerOpen}
                onClose={() => setIsPickerOpen(false)}
                allowClose={true}
            >
                <div className={styles.pickerModal}>
                    <h3 className={styles.pickerTitle}>Select Grapheme</h3>
                    <input
                        type="text"
                        placeholder="Search by name or pronunciation..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className={styles.searchInput}
                        autoFocus
                    />
                    <div className={styles.graphemeGrid}>
                        {filteredGraphemes.map(grapheme => {
                            const combinedSvg = grapheme.glyphs
                                .map(glyph => glyph.svg_data)
                                .join('');
                            const sanitizedSvg = DOMPurify.sanitize(combinedSvg, {
                                USE_PROFILES: { svg: true, svgFilters: true },
                            });
                            const primaryPhoneme = grapheme.phonemes.find(p => p.use_in_auto_spelling) || grapheme.phonemes[0];

                            return (
                                <button
                                    key={grapheme.id}
                                    className={styles.pickerCard}
                                    onClick={() => {
                                        handleAddGrapheme(grapheme.id);
                                        setIsPickerOpen(false);
                                        setSearchQuery('');
                                    }}
                                    type="button"
                                >
                                    <div
                                        className={styles.pickerSvg}
                                        dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
                                    />
                                    <span className={styles.pickerName}>{grapheme.name}</span>
                                    {primaryPhoneme && (
                                        <span className={styles.pickerPhoneme}>/{primaryPhoneme.phoneme}/</span>
                                    )}
                                </button>
                            );
                        })}
                        {filteredGraphemes.length === 0 && (
                            <div className={styles.noResults}>No graphemes found</div>
                        )}
                    </div>
                </div>
            </Modal>
        </div>
    );
});

SpellingInput.displayName = "SpellingInput";
export default SpellingInput;
