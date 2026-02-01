'use client';

import styles from "./pronunciationTableInput.module.scss";
import classNames from "classnames";
import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import type { registerFieldReturnType } from "smart-form/types";
import { translationMapHelper } from "utils-func/localization";
import IconButton from "cyber-components/interactable/buttons/iconButton/iconButton.tsx";
import HoverToolTip from "cyber-components/interactable/information/hoverToolTip/hoverToolTip.tsx";
import LabelShiftTextCustomKeyboardInput from "smart-form/input/fancy/redditStyle/labelShiftTextCustomKeyboardInput";
import { SmartForm, useSmartForm } from "smart-form/smartForm";
import type { useSmartFormRef } from "smart-form/types";
import { IPA_CHARACTERS } from "cyber-components/interactable/customKeyboard/ipaCharacters";
import { ProcessingLockModalProvider } from "cyber-components/graphics/loading/processingLockModal/processingLockModal";

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

    // Use ref to hold fieldState to avoid infinite loops in useEffect
    const fieldStateRef = useRef(fieldState);
    fieldStateRef.current = fieldState;

    // Row state management - tracks row IDs and checkbox states
    const [rows, setRows] = useState<RowState[]>(() => {
        const initialRows = defaultValue?.length > 0
            ? defaultValue
            : [{ pronunciation: "", useInAutoSpelling: true }];

        return initialRows.map((row, index) => ({
            id: `${idPrefix}-row-${index}`,
            pronunciation: row.pronunciation || "",
            useInAutoSpelling: row.useInAutoSpelling || false
        }));
    });

    // Update parent field state when rows change
    useEffect(() => {
        // Skip initial render
        if (isInitialRender.current) {
            isInitialRender.current = false;
            return;
        }

        fieldStateRef.current.isTouched.setIsTouched(true);
        fieldStateRef.current.isChanged.setIsChanged(true);
    }, [rows]);

    return (
        <ProcessingLockModalProvider>
            <PronunciationTableInputInner
                rows={rows}
                setRows={setRows}
                fieldStateRef={fieldStateRef}
                registerSmartFieldProps={registerSmartFieldProps}
                t={t}
                maxRows={maxRows}
                requirePronunciation={requirePronunciation}
                className={className}
                idPrefix={idPrefix}
            />
        </ProcessingLockModalProvider>
    );
});

/** Inner component that uses useSmartForm (needs to be inside ProcessingLockModalProvider) */
interface PronunciationTableInputInnerProps {
    rows: RowState[];
    setRows: React.Dispatch<React.SetStateAction<RowState[]>>;
    fieldStateRef: React.MutableRefObject<PronunciationTableInputProps['fieldState']>;
    registerSmartFieldProps: PronunciationTableInputProps['registerSmartFieldProps'];
    t: (key: keyof typeof defaultTranslationMap) => string;
    maxRows?: number;
    requirePronunciation: boolean;
    className?: string;
    idPrefix: string;
}

const PronunciationTableInputInner = ({
    rows,
    setRows,
    fieldStateRef,
    registerSmartFieldProps,
    t,
    maxRows,
    requirePronunciation,
    className,
    idPrefix,
}: PronunciationTableInputInnerProps) => {
    // Create internal SmartForm for managing pronunciation rows
    const { registerField, registerForm, unregisterField, isFormValid } = useSmartForm({});

    // Create ref for the SmartForm imperative handle
    const smartFormRef = useRef<useSmartFormRef>(null);

    // Register self as a mini SmartForm
    const selfFormProps = registerForm("pronunciationTableInput", {});

    // Expose value via useImperativeHandle - returns array of pronunciation rows
    useImperativeHandle(registerSmartFieldProps.ref, () => ({
        get value(): PronunciationRowValue[] {
            const formValues = smartFormRef.current?.value || {};

            // Map rows to output format, maintaining order
            return rows.map(row => ({
                pronunciation: formValues[`pronunciation-${row.id}`] || "",
                useInAutoSpelling: row.useInAutoSpelling
            }));
        }
    }), [rows]);

    // Validate and update isEmpty/isInputValid states
    useEffect(() => {
        const formValues = smartFormRef.current?.value || {};

        const allEmpty = rows.every(row => {
            const value = formValues[`pronunciation-${row.id}`];
            return !value || value.trim() === "";
        });

        fieldStateRef.current.isEmpty.setIsEmpty(allEmpty);

        // If requirePronunciation is true, check that all rows have pronunciation
        if (requirePronunciation) {
            const allValid = rows.every(row => {
                const value = formValues[`pronunciation-${row.id}`];
                return value && value.trim() !== "";
            });
            fieldStateRef.current.isInputValid.setIsInputValid(allValid);
        } else {
            fieldStateRef.current.isInputValid.setIsInputValid(true);
        }
    }, [rows, requirePronunciation, isFormValid, fieldStateRef]);

    // Row operations
    const handleAddRow = useCallback(() => {
        if (maxRows && rows.length >= maxRows) {
            return;
        }

        const newRow: RowState = {
            id: `${idPrefix}-row-${Date.now()}`,
            pronunciation: "",
            useInAutoSpelling: true
        };

        setRows(prev => [...prev, newRow]);
    }, [rows.length, maxRows, idPrefix, setRows]);

    const handleRemoveRow = useCallback((rowId: string) => {
        if (rows.length <= 1) return;

        // Unregister the field before removing the row
        unregisterField(`pronunciation-${rowId}`);

        setRows(prev => prev.filter(row => row.id !== rowId));
    }, [rows.length, unregisterField, setRows]);

    // Checkbox change handler
    const handleCheckboxChange = useCallback((rowId: string, checked: boolean) => {
        setRows(prev => prev.map(row =>
            row.id === rowId ? { ...row, useInAutoSpelling: checked } : row
        ));
    }, [setRows]);

    return (
        <SmartForm
            ref={smartFormRef}
            as={"div"}
            {...selfFormProps}
            registerField={registerField}
            unregisterField={unregisterField}
            isFormValid={isFormValid}
            className={classNames(styles.pronunciationTableInput, className)}
        >
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
                                    <LabelShiftTextCustomKeyboardInput
                                        {...registerField(`pronunciation-${row.id}`, {
                                            defaultValue: row.pronunciation
                                        })}
                                        characters={IPA_CHARACTERS}
                                        displayName={t("pronunciationLabel")}
                                        className={styles.textInput}
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
        </SmartForm>
    );
};

PronunciationTableInput.displayName = "PronunciationTableInput";
export default PronunciationTableInput;
