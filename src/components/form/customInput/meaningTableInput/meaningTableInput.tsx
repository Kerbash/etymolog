import styles from "./meaningTableInput.module.scss";
import classNames from "classnames";
import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import type { registerFieldReturnType } from "smart-form/types";
import { translationMapHelper } from "utils-func/localization";
import IconButton from "cyber-components/interactable/buttons/iconButton/iconButton.tsx";
import HoverToolTip from "cyber-components/interactable/information/hoverToolTip/hoverToolTip.tsx";
import LabelShiftTextInput from "smart-form/input/fancy/redditStyle/labelShiftTextInput/labelShiftTextInput.tsx";
import TextInputValidatorFactory from "smart-form/commonValidatorFactory/textValidatorFactory/textValidatorFactory";
import { SmartForm, useSmartForm } from "smart-form/smartForm";
import type { useSmartFormRef } from "smart-form/types";
import { defaultTranslationMap } from "./translations";
import { useEditedSinceMount } from "../useEditedSinceMount";

/** Types -------------------------------------- */

export type MeaningRowValue = {
    meaning: string;
    part_of_speech?: string;
    usage_notes?: string;
};

export interface MeaningTableInputProps extends registerFieldReturnType {
    TranslationMaps?: Partial<typeof defaultTranslationMap>;
    defaultValue?: MeaningRowValue[];
    maxRows?: number;
    className?: string;
}

/** Internal row state type -------------------------------------- */

type RowState = {
    id: string;
    meaning: string;
    part_of_speech: string;
    usage_notes: string;
};

/** Component -------------------------------------- */

export const MeaningTableInput = forwardRef((
    {
        registerSmartFieldProps,
        fieldState,
        TranslationMaps = {},
        defaultValue = [],
        maxRows,
        className,
    }: MeaningTableInputProps,
    // Unused — the value is exposed through `registerSmartFieldProps.ref` (see
    // the `useImperativeHandle` below) — but DECLARED, because React warns at
    // runtime when a `forwardRef` render function takes fewer than two
    // parameters.
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

    // Row state management
    const [rows, setRows] = useState<RowState[]>(() => {
        const initialRows = defaultValue?.length > 0
            ? defaultValue
            : [{ meaning: "", part_of_speech: "", usage_notes: "" }];

        return initialRows.map((row, index) => ({
            id: `${idPrefix}-row-${index}`,
            meaning: row.meaning || "",
            part_of_speech: row.part_of_speech || "",
            usage_notes: row.usage_notes || "",
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
        <MeaningTableInputInner
            rows={rows}
            setRows={setRows}
            fieldStateRef={fieldStateRef}
            registerSmartFieldProps={registerSmartFieldProps}
            t={t}
            maxRows={maxRows}
            className={className}
            idPrefix={idPrefix}
        />
    );
});

/** Inner component that uses useSmartForm (needs to be inside ProcessingLockModalProvider) */
interface MeaningTableInputInnerProps {
    rows: RowState[];
    setRows: React.Dispatch<React.SetStateAction<RowState[]>>;
    fieldStateRef: React.MutableRefObject<MeaningTableInputProps['fieldState']>;
    registerSmartFieldProps: MeaningTableInputProps['registerSmartFieldProps'];
    t: (key: keyof typeof defaultTranslationMap) => string;
    maxRows?: number;
    className?: string;
    idPrefix: string;
}

const MeaningTableInputInner = ({
    rows,
    setRows,
    fieldStateRef,
    registerSmartFieldProps,
    t,
    maxRows,
    className,
    idPrefix,
}: MeaningTableInputInnerProps) => {
    // Create internal SmartForm for managing meaning rows
    const { registerField, registerForm, unregisterField } = useSmartForm({});

    // Create ref for the SmartForm imperative handle
    const smartFormRef = useRef<useSmartFormRef>(null);

    // Register self as a mini SmartForm
    const selfFormProps = registerForm("meaningTableInput", {});

    // Expose value via useImperativeHandle - returns array of meaning rows
    useImperativeHandle(registerSmartFieldProps.ref, () => ({
        get value(): MeaningRowValue[] {
            const formValues = smartFormRef.current?.value || {};

            // Map rows to output format, maintaining order
            return rows.map(row => ({
                meaning: formValues[`meaning-${row.id}`] || "",
                part_of_speech: formValues[`partOfSpeech-${row.id}`] || undefined,
                usage_notes: formValues[`usageNotes-${row.id}`] || undefined,
            }));
        }
    }), [rows]);

    /**
     * Mirror the INNER form's dirty flag onto the outer field.
     *
     * The outer effect fires on `rows`, i.e. only when a row is ADDED or
     * REMOVED. Text typed into an existing row changes this field's value
     * without touching `rows`, so on its own it left `formState.isChanged`
     * false on the host form and a word whose only edit was its meaning text
     * had no unsaved-changes protection at all. (It was masked until now by the
     * mount-time false positive the StrictMode fix removed.)
     *
     * Safe to run unguarded: SmartForm sets `isChanged` on real edits only —
     * seeding a field through `defaultValue` explicitly does not.
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
            const value = formValues[`meaning-${row.id}`];
            return !value || value.trim() === "";
        });

        fieldStateRef.current.isEmpty.setIsEmpty(allEmpty);

        // At least one meaning must have non-empty text
        const allValid = rows.some(row => {
            const value = formValues[`meaning-${row.id}`];
            return value && value.trim() !== "";
        });
        fieldStateRef.current._setValidation(allValid ? null : { type: 'error', message: 'Invalid entries' });
    }, [rows, selfFormProps.formState.isValid, fieldStateRef]);

    // Row operations
    const handleAddRow = useCallback(() => {
        if (maxRows && rows.length >= maxRows) {
            return;
        }

        const newRow: RowState = {
            id: `${idPrefix}-row-${Date.now()}`,
            meaning: "",
            part_of_speech: "",
            usage_notes: "",
        };

        setRows(prev => [...prev, newRow]);
    }, [rows.length, maxRows, idPrefix, setRows]);

    const handleRemoveRow = useCallback((rowId: string) => {
        if (rows.length <= 1) return;

        // Unregister fields before removing the row
        unregisterField(`meaning-${rowId}`);
        unregisterField(`partOfSpeech-${rowId}`);
        unregisterField(`usageNotes-${rowId}`);

        setRows(prev => prev.filter(row => row.id !== rowId));
    }, [rows.length, unregisterField, setRows]);

    return (
        <SmartForm
            ref={smartFormRef}
            as={"div"}
            {...selfFormProps}
            registerField={registerField}
            unregisterField={unregisterField}
            className={classNames(styles.meaningTableInput, className)}
        >
            <div className={styles.tableContainer}>
                <table className={styles.meaningTable}>
                    <thead>
                        {/* `scope="col"` on every header, and the actions
                            column is NAMED rather than being a cell holding a
                            bare button. */}
                        <tr>
                            <th scope="col">{t("meaningLabel")}</th>
                            <th scope="col">{t("partOfSpeechLabel")}</th>
                            <th scope="col">{t("usageNotesLabel")}</th>
                            <th scope="col">
                                <span className={styles.srOnly}>Actions</span>
                                <HoverToolTip content={"Add a new meaning entry"}>
                                    <IconButton
                                        iconName={'plus-circle'}
                                        onClick={handleAddRow}
                                        title={t("addMeaning")}
                                        className={styles.addButton}
                                        iconSize={'1.5em'}
                                        iconColor={'var(--green)'}
                                        themeType={'basic'}
                                        aria-label={t("addMeaning")}
                                    />
                                </HoverToolTip>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, rowIndex) => (
                            <tr key={row.id}>
                                <td>
                                    <LabelShiftTextInput
                                        {...registerField(`meaning-${row.id}`, {
                                            defaultValue: row.meaning,
                                            validation: TextInputValidatorFactory({
                                                required: { value: true, message: "At least one meaning is required" },
                                            }),
                                        })}
                                        displayName={`${t("meaningLabel")} ${rowIndex + 1}`}
                                        className={styles.textInput}
                                    />
                                </td>
                                <td>
                                    <LabelShiftTextInput
                                        {...registerField(`partOfSpeech-${row.id}`, {
                                            defaultValue: row.part_of_speech
                                        })}
                                        displayName={`${t("partOfSpeechLabel")} ${rowIndex + 1}`}
                                        className={styles.textInput}
                                    />
                                </td>
                                <td>
                                    <LabelShiftTextInput
                                        {...registerField(`usageNotes-${row.id}`, {
                                            defaultValue: row.usage_notes
                                        })}
                                        displayName={`${t("usageNotesLabel")} ${rowIndex + 1}`}
                                        className={styles.textInput}
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
                                            aria-label={`${t("removeMeaning")} meaning ${rowIndex + 1}`}
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

MeaningTableInput.displayName = "MeaningTableInput";
export default MeaningTableInput;
