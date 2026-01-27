'use client';

import styles from "./AncestryInput.module.scss";
import classNames from "classnames";
import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import type { registerFieldReturnType } from "smart-form/types";
import type { Lexicon, AncestryType, LexiconAncestorFormRow } from "../../../../db/types";
import IconButton from "cyber-components/interactable/buttons/iconButton/iconButton.tsx";
import HoverToolTip from "cyber-components/interactable/information/hoverToolTip/hoverToolTip.tsx";

/** Types -------------------------------------- */

export interface AncestryInputProps extends registerFieldReturnType {
    /** Current lexicon ID for cycle detection (in edit mode) */
    currentLexiconId?: number;
    /** Available lexicon entries to choose from */
    availableLexicon: Lexicon[];
    /** IDs to exclude from selection (e.g., self + current ancestors) */
    excludeIds?: number[];
    /** Function to check if adding ancestor would create cycle */
    checkCycle?: (lexiconId: number, ancestorId: number) => boolean;
    defaultValue?: LexiconAncestorFormRow[];
    maxRows?: number;
    className?: string;
}

const ANCESTRY_TYPES: { value: AncestryType; label: string }[] = [
    { value: 'derived', label: 'Derived' },
    { value: 'borrowed', label: 'Borrowed' },
    { value: 'compound', label: 'Compound' },
    { value: 'blend', label: 'Blend' },
    { value: 'calque', label: 'Calque' },
    { value: 'other', label: 'Other' },
];

/** Internal row state type */
type RowState = {
    id: string;
    ancestorId: number | null;
    ancestryType: AncestryType;
    error?: string;
};

/** Component -------------------------------------- */

export const AncestryInput = forwardRef((
    {
        registerSmartFieldProps,
        fieldState,
        currentLexiconId,
        availableLexicon,
        excludeIds = [],
        checkCycle,
        defaultValue = [],
        maxRows,
        className,
    }: AncestryInputProps,
    _
) => {
    const idPrefix = useId();
    const isInitialRender = useRef(true);
    const fieldStateRef = useRef(fieldState);
    fieldStateRef.current = fieldState;

    // Row state management
    const [rows, setRows] = useState<RowState[]>(() => {
        if (defaultValue.length > 0) {
            return defaultValue.map((row, index) => ({
                id: `${idPrefix}-row-${index}`,
                ancestorId: row.ancestorId,
                ancestryType: row.ancestryType,
            }));
        }
        return [];
    });

    // Search state for each row
    const [searchQueries, setSearchQueries] = useState<Record<string, string>>({});

    // Build exclude set (including already selected ancestors)
    const excludeSet = new Set([
        ...excludeIds,
        ...(currentLexiconId ? [currentLexiconId] : []),
        ...rows.filter(r => r.ancestorId !== null).map(r => r.ancestorId!),
    ]);

    // Expose value via useImperativeHandle
    useImperativeHandle(registerSmartFieldProps.ref, () => ({
        get value(): LexiconAncestorFormRow[] {
            return rows
                .filter(row => row.ancestorId !== null && !row.error)
                .map(row => ({
                    ancestorId: row.ancestorId!,
                    ancestryType: row.ancestryType,
                }));
        }
    }), [rows]);

    // Update parent field state when rows change
    useEffect(() => {
        if (isInitialRender.current) {
            isInitialRender.current = false;
            return;
        }

        fieldStateRef.current.isTouched.setIsTouched(true);
        fieldStateRef.current.isChanged.setIsChanged(true);

        const validRows = rows.filter(r => r.ancestorId !== null && !r.error);
        fieldStateRef.current.isEmpty.setIsEmpty(validRows.length === 0);

        const hasErrors = rows.some(r => r.error);
        fieldStateRef.current.isInputValid.setIsInputValid(!hasErrors);
    }, [rows]);

    // Add row
    const handleAddRow = useCallback(() => {
        if (maxRows && rows.length >= maxRows) return;

        const newRow: RowState = {
            id: `${idPrefix}-row-${Date.now()}`,
            ancestorId: null,
            ancestryType: 'derived',
        };

        setRows(prev => [...prev, newRow]);
    }, [rows.length, maxRows, idPrefix]);

    // Remove row
    const handleRemoveRow = useCallback((rowId: string) => {
        setRows(prev => prev.filter(row => row.id !== rowId));
        setSearchQueries(prev => {
            const next = { ...prev };
            delete next[rowId];
            return next;
        });
    }, []);

    // Select ancestor for a row
    const handleSelectAncestor = useCallback((rowId: string, ancestorId: number) => {
        // Check for cycles
        if (currentLexiconId && checkCycle) {
            const wouldCycle = checkCycle(currentLexiconId, ancestorId);
            if (wouldCycle) {
                setRows(prev => prev.map(row =>
                    row.id === rowId
                        ? { ...row, ancestorId, error: 'This would create a cycle in the etymology tree' }
                        : row
                ));
                return;
            }
        }

        setRows(prev => prev.map(row =>
            row.id === rowId
                ? { ...row, ancestorId, error: undefined }
                : row
        ));
        setSearchQueries(prev => ({ ...prev, [rowId]: '' }));
    }, [currentLexiconId, checkCycle]);

    // Change ancestry type for a row
    const handleTypeChange = useCallback((rowId: string, ancestryType: AncestryType) => {
        setRows(prev => prev.map(row =>
            row.id === rowId ? { ...row, ancestryType } : row
        ));
    }, []);

    // Clear selection for a row
    const handleClearSelection = useCallback((rowId: string) => {
        setRows(prev => prev.map(row =>
            row.id === rowId ? { ...row, ancestorId: null, error: undefined } : row
        ));
    }, []);

    // Get lexicon by ID
    const getLexicon = (id: number) => availableLexicon.find(l => l.id === id);

    // Filter available lexicon for dropdown (excluding already selected and self)
    const getFilteredLexicon = (rowId: string) => {
        const query = (searchQueries[rowId] || '').toLowerCase().trim();
        const currentRow = rows.find(r => r.id === rowId);

        return availableLexicon.filter(lex => {
            // Don't exclude the current row's selection
            if (currentRow?.ancestorId === lex.id) return true;
            // Exclude self and already selected
            if (excludeSet.has(lex.id)) return false;
            // Apply search filter
            if (query) {
                return (
                    lex.lemma.toLowerCase().includes(query) ||
                    lex.pronunciation?.toLowerCase().includes(query) ||
                    lex.meaning?.toLowerCase().includes(query)
                );
            }
            return true;
        });
    };

    return (
        <div className={classNames(styles.ancestryInput, className)}>
            <div className={styles.header}>
                <span className={styles.label}>Etymology / Ancestors</span>
                <HoverToolTip content="Add an ancestor word">
                    <IconButton
                        iconName="plus-circle"
                        onClick={handleAddRow}
                        disabled={maxRows !== undefined && rows.length >= maxRows}
                        iconColor="var(--green)"
                        iconSize="1.25rem"
                        themeType="basic"
                    >
                        Add Ancestor
                    </IconButton>
                </HoverToolTip>
            </div>

            {rows.length === 0 ? (
                <div className={styles.emptyState}>
                    No ancestors defined. Click "Add Ancestor" to link this word's etymology.
                </div>
            ) : (
                <div className={styles.rowsContainer}>
                    {rows.map((row, index) => {
                        const selectedLexicon = row.ancestorId ? getLexicon(row.ancestorId) : null;
                        const filteredOptions = getFilteredLexicon(row.id);

                        return (
                            <div key={row.id} className={classNames(styles.row, { [styles.hasError]: row.error })}>
                                <span className={styles.rowNumber}>{index + 1}.</span>

                                {/* Ancestor selector */}
                                <div className={styles.ancestorSelector}>
                                    {selectedLexicon ? (
                                        <div className={styles.selectedAncestor}>
                                            <span className={styles.selectedLemma}>{selectedLexicon.lemma}</span>
                                            {selectedLexicon.pronunciation && (
                                                <span className={styles.selectedPronunciation}>
                                                    /{selectedLexicon.pronunciation}/
                                                </span>
                                            )}
                                            <IconButton
                                                iconName="x"
                                                onClick={() => handleClearSelection(row.id)}
                                                iconColor="var(--text-secondary)"
                                                iconSize="0.875rem"
                                                themeType="basic"
                                            />
                                        </div>
                                    ) : (
                                        <div className={styles.searchContainer}>
                                            <input
                                                type="text"
                                                placeholder="Search for ancestor word..."
                                                value={searchQueries[row.id] || ''}
                                                onChange={(e) => setSearchQueries(prev => ({
                                                    ...prev,
                                                    [row.id]: e.target.value
                                                }))}
                                                className={styles.searchInput}
                                            />
                                            {(searchQueries[row.id] || filteredOptions.length <= 10) && (
                                                <div className={styles.dropdown}>
                                                    {filteredOptions.slice(0, 10).map(lex => (
                                                        <button
                                                            key={lex.id}
                                                            type="button"
                                                            className={styles.dropdownItem}
                                                            onClick={() => handleSelectAncestor(row.id, lex.id)}
                                                        >
                                                            <span className={styles.optionLemma}>{lex.lemma}</span>
                                                            {lex.pronunciation && (
                                                                <span className={styles.optionPronunciation}>
                                                                    /{lex.pronunciation}/
                                                                </span>
                                                            )}
                                                        </button>
                                                    ))}
                                                    {filteredOptions.length === 0 && (
                                                        <div className={styles.noOptions}>No matching words</div>
                                                    )}
                                                    {filteredOptions.length > 10 && (
                                                        <div className={styles.moreOptions}>
                                                            Type to filter ({filteredOptions.length} options)
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Ancestry type selector */}
                                <select
                                    value={row.ancestryType}
                                    onChange={(e) => handleTypeChange(row.id, e.target.value as AncestryType)}
                                    className={styles.typeSelect}
                                >
                                    {ANCESTRY_TYPES.map(type => (
                                        <option key={type.value} value={type.value}>
                                            {type.label}
                                        </option>
                                    ))}
                                </select>

                                {/* Remove button */}
                                <IconButton
                                    iconName="trash3"
                                    onClick={() => handleRemoveRow(row.id)}
                                    iconColor="var(--status-bad)"
                                    iconSize="1rem"
                                    themeType="basic"
                                />

                                {/* Error message */}
                                {row.error && (
                                    <div className={styles.errorMessage}>{row.error}</div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
});

AncestryInput.displayName = "AncestryInput";
export default AncestryInput;
