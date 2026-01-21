'use client';

import styles from "./pronunciationTableInput.module.scss";
import classNames from "classnames";
import React, { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import type { registerFieldReturnType } from "smart-form/types";
import { translationMapHelper } from "utils-func/localization";
import SvgIcon from "cyber-components/graphics/decor/svgIcon/svgIcon";

/** Translation keys -------------------------------------- */

export const defaultTranslationMap = {
    addPronunciation: "Add Pronunciation",
    removePronunciation: "Remove",
    pronunciationLabel: "Pronunciation",
    useInAutoSpellingLabel: "Use in auto-spelling",
};

export const translationMapKeys = Object.keys(defaultTranslationMap);

/** Types -------------------------------------- */

export type PronunciationRowValue = {
    pronunciation: string;
    useInAutoSpelling: boolean;
};

export interface PronunciationTableInputProps extends registerFieldReturnType {
    TranslationMaps?: Partial<typeof defaultTranslationMap>;
    defaultValue?: PronunciationRowValue[];
    maxRows?: number;
    requirePronunciation?: boolean;
    className?: string;
}

/** Internal row state type -------------------------------------- */

type RowState = {
    id: string;
    pronunciation: string;
    useInAutoSpelling: boolean;
};

/** Component -------------------------------------- */

export const PronunciationTableInput = forwardRef((
    {
        registerSmartFieldProps,
        fieldState,
        utils,
        TranslationMaps = {},
        defaultValue = [],
        maxRows,
        requirePronunciation = false,
        className,
    }: PronunciationTableInputProps,
    _
) => {
    const t = translationMapHelper(TranslationMaps, defaultTranslationMap);

    // Get hydration-safe ID prefix
    const idPrefix = useId();

    // Track initial render to avoid setting touched on mount
    const isInitialRender = useRef(true);

    // Use ref to hold fieldState to avoid infinite loops in useEffect/useCallback
    const fieldStateRef = useRef(fieldState);
    fieldStateRef.current = fieldState;

    // Row state management - single source of truth
    const [rows, setRows] = useState<RowState[]>(() => {
        const initialRows = defaultValue?.length > 0
            ? defaultValue
            : [{ pronunciation: "", useInAutoSpelling: false }];

        return initialRows.map((row, index) => ({
            id: `${idPrefix}-row-${index}`,
            pronunciation: row.pronunciation || "",
            useInAutoSpelling: row.useInAutoSpelling || false
        }));
    });

    // Expose value via useImperativeHandle
    useImperativeHandle(registerSmartFieldProps.ref, () => ({
        get value(): PronunciationRowValue[] {
            return rows.map(row => ({
                pronunciation: row.pronunciation,
                useInAutoSpelling: row.useInAutoSpelling
            }));
        }
    }), [rows]);

    // Update parent field state when rows change
    useEffect(() => {
        // Skip initial render
        if (isInitialRender.current) {
            isInitialRender.current = false;
            return;
        }

        fieldStateRef.current.isTouched.setIsTouched(true);
    }, [rows]);

    // Validate and update isEmpty/isInputValid states
    useEffect(() => {
        const allEmpty = rows.every(row => !row.pronunciation || row.pronunciation.trim() === "");
        fieldStateRef.current.isEmpty.setIsEmpty(allEmpty);

        // If requirePronunciation is true, check that all rows have pronunciation
        if (requirePronunciation) {
            const allValid = rows.every(row => row.pronunciation && row.pronunciation.trim() !== "");
            fieldStateRef.current.isInputValid.setIsInputValid(allValid);
        } else {
            fieldStateRef.current.isInputValid.setIsInputValid(true);
        }
    }, [rows, requirePronunciation]);

    // Row operations
    const handleAddRow = useCallback(() => {
        if (maxRows && rows.length >= maxRows) {
            return;
        }

        const newRow: RowState = {
            id: `${idPrefix}-row-${Date.now()}`,
            pronunciation: "",
            useInAutoSpelling: false
        };

        setRows(prev => [...prev, newRow]);
        fieldStateRef.current.isChanged.setIsChanged(true);
    }, [rows.length, maxRows, idPrefix]);

    const handleRemoveRow = useCallback((rowId: string) => {
        if (rows.length <= 1) return;

        setRows(prev => prev.filter(row => row.id !== rowId));
        fieldStateRef.current.isChanged.setIsChanged(true);
    }, [rows.length]);

    // Field change handlers
    const handlePronunciationChange = useCallback((rowId: string, value: string) => {
        setRows(prev => prev.map(row =>
            row.id === rowId ? { ...row, pronunciation: value } : row
        ));
        fieldStateRef.current.isChanged.setIsChanged(true);
    }, []);

    const handleCheckboxChange = useCallback((rowId: string, checked: boolean) => {
        setRows(prev => prev.map(row =>
            row.id === rowId ? { ...row, useInAutoSpelling: checked } : row
        ));
        fieldStateRef.current.isChanged.setIsChanged(true);
    }, []);

    return (
        <div className={classNames(styles.pronunciationTableInput, className)}>
            <div className={styles.tableContainer}>
                <table className={styles.pronunciationTable}>
                    <thead>
                        <tr>
                            <th>{t("pronunciationLabel")}</th>
                            <th>{t("useInAutoSpellingLabel")}</th>
                            <th>
                                <button
                                    type="button"
                                    onClick={handleAddRow}
                                    className={styles.addButton}
                                    disabled={maxRows ? rows.length >= maxRows : false}
                                    title={t("addPronunciation")}
                                >
                                    <SvgIcon iconName="plus-lg" size="1.2rem" />
                                </button>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <tr key={row.id}>
                                <td>
                                    <input
                                        type="text"
                                        value={row.pronunciation}
                                        onChange={(e) => handlePronunciationChange(row.id, e.target.value)}
                                        className={styles.textInput}
                                        placeholder="Enter pronunciation"
                                    />
                                </td>
                                <td>
                                    <input
                                        type="checkbox"
                                        checked={row.useInAutoSpelling}
                                        onChange={(e) => handleCheckboxChange(row.id, e.target.checked)}
                                        className={styles.checkbox}
                                    />
                                </td>
                                <td>
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveRow(row.id)}
                                        disabled={rows.length === 1}
                                        className={styles.removeButton}
                                        title={t("removePronunciation")}
                                    >
                                        <SvgIcon iconName="trash3" size="1rem" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
});

PronunciationTableInput.displayName = "PronunciationTableInput";
export default PronunciationTableInput;
