'use client';

import styles from "./pronunciationTableInput.module.scss";
import classNames from "classnames";
import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import type { registerFieldReturnType, fieldOptions } from "smart-form/types";
import { translationMapHelper } from "utils-func/localization";
import IconButton from "cyber-components/interactable/buttons/iconButton/iconButton.tsx";
import HoverToolTip from "cyber-components/interactable/information/hoverToolTip/hoverToolTip.tsx";
import LabelShiftTextCustomKeyboardInput from "smart-form/input/fancy/redditStyle/labelShiftTextCustomKeyboardInput";
import { useSmartFormContext, useSmartFormContextOptional } from "smart-form/smartForm";

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
    /**
     * Optional: Pass registerField directly as a prop for cases where context isn't available.
     * If not provided, the component will try to get it from SmartFormContext.
     */
    registerFieldProp?: (name: string, options?: fieldOptions) => registerFieldReturnType;
    /**
     * Optional: Pass unregisterField directly as a prop.
     * If not provided, the component will try to get it from SmartFormContext.
     */
    unregisterFieldProp?: (name: string) => void;
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
        TranslationMaps = {},
        defaultValue = [],
        maxRows,
        requirePronunciation = false,
        className,
        registerFieldProp,
        unregisterFieldProp,
    }: PronunciationTableInputProps,
    _
) => {
    const t = translationMapHelper(TranslationMaps, defaultTranslationMap);

    // Try to get registerField from context, fall back to prop
    const smartFormContext = useSmartFormContextOptional();
    const registerField = registerFieldProp ?? smartFormContext?.registerField;
    const unregisterField = unregisterFieldProp ?? smartFormContext?.unregisterField;

    // Warn in development if neither context nor prop is available
    if (!registerField) {
        console.warn(
            'PronunciationTableInput: No registerField available. ' +
            'Either wrap the form with <SmartForm registerField={registerField} unregisterField={unregisterField}> ' +
            'or pass registerFieldProp directly.'
        );
    }

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

        // Unregister the field before removing the row
        if (unregisterField) {
            unregisterField('pronunciation-' + rowId);
        }

        setRows(prev => prev.filter(row => row.id !== rowId));
        fieldStateRef.current.isChanged.setIsChanged(true);
    }, [rows.length, unregisterField]);

    // Cleanup all dynamic fields on unmount
    useEffect(() => {
        return () => {
            if (unregisterField) {
                rows.forEach(row => {
                    unregisterField('pronunciation-' + row.id);
                });
            }
        };
    }, []); // Empty deps - only run cleanup on unmount

    // Field change handlers - not needed since we use controlled inputs via registerField
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
                                <HoverToolTip content={"Add a new pronunciation entry"}>
                                    <IconButton
                                        iconName={'plus-circle'}
                                        onClick={handleAddRow}
                                        title={t("addPronunciation")}
                                        className={styles.addButton}
                                        iconSize={'1.5em'}
                                        iconColor={'var(--green)'}
                                        themeType={'basic'}
                                    />
                                </HoverToolTip>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <tr key={row.id}>
                                <td>
                                    {registerField ? (
                                        <LabelShiftTextCustomKeyboardInput
                                            {...registerField('pronunciation-' + row.id, {})}
                                            className={styles.textInput}
                                        />
                                    ) : (
                                        <input
                                            type="text"
                                            className={styles.textInput}
                                            placeholder="Enter pronunciation"
                                        />
                                    )}
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
                                    <HoverToolTip content={"Remove this row"}>
                                        <IconButton
                                            type={"button"}
                                            onClick={() => handleRemoveRow(row.id)}
                                            disabled={rows.length === 1}
                                            iconName={"trash3"}
                                            iconSize={'1.5em'}
                                            iconColor={'red'}
                                        />
                                    </HoverToolTip>
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
