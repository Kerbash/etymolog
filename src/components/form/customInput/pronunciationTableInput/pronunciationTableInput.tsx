'use client';

import styles from "./pronunciationTableInput.module.scss";
import classNames from "classnames";
import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { registerFieldReturnType } from "smart-form/types";
import { translationMapHelper } from "utils-func/localization";
import IconButton from "cyber-components/interactable/buttons/iconButton/iconButton.tsx";
import HoverToolTip from "cyber-components/interactable/information/hoverToolTip/hoverToolTip.tsx";
import LabelShiftTextCustomKeyboardInput from "smart-form/input/fancy/redditStyle/labelShiftTextCustomKeyboardInput";
import TextInputValidatorFactory from "smart-form/commonValidatorFactory/textValidatorFactory/textValidatorFactory.ts";
import { SmartForm, useSmartForm } from "smart-form/smartForm";
import type { useSmartFormRef } from "smart-form/types";
import { IPA_CHARACTERS } from "cyber-components/interactable/customKeyboard/ipaCharacters";

/** Translation keys live in a sibling module — see `translationMap.ts`. */
import { defaultTranslationMap } from "./translationMap";
import { useEditedSinceMount } from "../useEditedSinceMount";

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
    // A forwardRef render function must declare TWO parameters even when the
    // ref is unused — deleting it makes React warn "forwardRef render functions
    // accept exactly two parameters" on every mount.
    _ref,
) => {
    const t = translationMapHelper(TranslationMaps, defaultTranslationMap);

    // Get hydration-safe ID prefix
    const idPrefix = useId();

    // `fieldState` is held in a ref so the effects below can read the LATEST
    // value without listing it as a dependency (it is a new object every
    // render, which would loop). The write is an effect and not a render-phase
    // assignment: a ref must not be touched while rendering, and this effect is
    // declared FIRST so it lands before the effects that read it.
    const fieldStateRef = useRef(fieldState);
    useEffect(() => {
        fieldStateRef.current = fieldState;
    });

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

    // Announce a REAL edit to the form. The guard is an identity comparison
    // against the rows this input mounted with, NOT a "first effect run" latch:
    // StrictMode runs every mount effect twice while keeping refs, so a latch
    // marked the untouched form changed. See `useEditedSinceMount`.
    const rowsEdited = useEditedSinceMount(rows);
    useEffect(() => {
        if (!rowsEdited) return;

        fieldStateRef.current.isTouched.setIsTouched(true);
        fieldStateRef.current.isChanged.setIsChanged(true);
    }, [rows, rowsEdited]);

    return (
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
    const { registerField, registerForm, unregisterField } = useSmartForm({});

    /**
     * The per-ROW required rule, when the caller asks for one.
     *
     * It is not decoration. The validation effect below re-derives the OUTER
     * field's validity from the inner form, and its only reactive trigger is
     * `selfFormProps.formState.isValid` — with no validator on the inner field
     * that boolean never changes, so the effect never re-ran after the very
     * first render and the outer field stayed permanently "Invalid entries".
     * The grapheme form's submit button was therefore disabled no matter what
     * the user typed, and only unstuck itself if they added or removed a row
     * (which changes `rows`, the other dependency). The sibling
     * `MeaningTableInput` never hit this because its inner field HAS a required
     * validator — the difference was invisible and the symptom was not.
     */
    const rowValidation = useMemo(
        () =>
            TextInputValidatorFactory({
                required: {
                    value: true,
                    message: "Enter a pronunciation, or remove this row",
                },
            }),
        [],
    );

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

    /**
     * Mirror the INNER form's dirty flag onto the outer field.
     *
     * The outer effect fires on `rows`, i.e. only when a row is ADDED or
     * REMOVED. Text typed into an existing row changes this field's value
     * without touching `rows`, so on its own the host form stayed "unchanged"
     * while holding a typed-but-unsaved pronunciation. Same reasoning as the
     * sibling `MeaningTableInput`.
     */
    const innerChanged = selfFormProps.formState.isChanged;
    useEffect(() => {
        if (!innerChanged) return;
        fieldStateRef.current.isTouched.setIsTouched(true);
        fieldStateRef.current.isChanged.setIsChanged(true);
    }, [innerChanged, fieldStateRef]);

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
            fieldStateRef.current._setValidation(allValid ? null : { type: 'error', message: 'Invalid entries' });
        } else {
            fieldStateRef.current._setValidation(null);
        }
    }, [rows, requirePronunciation, selfFormProps.formState.isValid, fieldStateRef]);

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
            className={classNames(styles.pronunciationTableInput, className)}
        >
            <div className={styles.tableContainer}>
                <table className={styles.pronunciationTable}>
                    <thead>
                        {/* `scope="col"` on every header, and the actions column
                            is NAMED rather than being an empty cell holding a
                            button — a header with no text leaves the controls
                            under it in an unnamed column. */}
                        <tr>
                            <th scope="col">{t("pronunciationLabel")}</th>
                            <th scope="col">{t("useInAutoSpellingLabel")}</th>
                            <th scope="col">
                                <span className={styles.srOnly}>Actions</span>
                                <HoverToolTip content={"Add a new pronunciation entry"}>
                                    <IconButton
                                        iconName={'plus-circle'}
                                        onClick={handleAddRow}
                                        title={t("addPronunciation")}
                                        iconSize={'1.5em'}
                                        iconColor={'var(--green)'}
                                        themeType={'basic'}
                                        aria-label={t("addPronunciation")}
                                    />
                                </HoverToolTip>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, rowIndex) => (
                            <tr key={row.id}>
                                <td>
                                    {/* Every row repeats the same three controls,
                                        so the column name alone does not identify
                                        them — each carries the ROW as well. */}
                                    <LabelShiftTextCustomKeyboardInput
                                        {...registerField(`pronunciation-${row.id}`, {
                                            defaultValue: row.pronunciation,
                                            validation: requirePronunciation ? rowValidation : undefined,
                                        })}
                                        characters={IPA_CHARACTERS}
                                        displayName={`${t("pronunciationLabel")} ${rowIndex + 1}`}
                                        className={styles.textInput}
                                        showBackspaceButton={true}
                                    />
                                </td>
                                <td>
                                    <input
                                        type="checkbox"
                                        checked={row.useInAutoSpelling}
                                        onChange={(e) => handleCheckboxChange(row.id, e.target.checked)}
                                        className={styles.checkbox}
                                        aria-label={`${t("useInAutoSpellingLabel")} for pronunciation ${rowIndex + 1}`}
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
                                            iconColor={'var(--status-bad)'}
                                            aria-label={`${t("removePronunciation")} pronunciation ${rowIndex + 1}`}
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
