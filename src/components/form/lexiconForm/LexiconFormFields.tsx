/**
 * LexiconFormFields
 * -------------------
 * Shared form fields for creating and editing lexicon entries.
 *
 * This component renders:
 * - Lemma Input (required)
 * - Pronunciation Input (IPA keyboard)
 * - Is Native Checkbox
 * - Auto-Spell Checkbox
 * - Meaning Input
 * - Part of Speech Input
 * - Notes Input
 * - Spelling Input (grapheme selection with IPA fallback support)
 * - Ancestry Input (ancestor relationships)
 *
 * Two-List Architecture Support:
 * - Outputs glyph_order format: ["grapheme-123", "ə", "grapheme-456"]
 * - Supports IPA fallback characters stored inline
 */

import classNames from "classnames";
import {useState, useMemo, useEffect, useRef, useCallback} from "react";
import type {LexiconComplete, LexiconAncestorFormRow, AutoSpellResultExtended, LexiconAncestryNode} from "../../../db/types";
import type {registerFieldReturnType} from "smart-form/types";
import {useEtymolog} from "../../../db";
import {buildVirtualGlyphMap} from "../../../db/autoSpellService";
import {deserializeGlyphOrder, type SpellingEntry} from "../../../db/utils/spellingUtils";
import type {VirtualGlyph} from "../customInput/glyphCanvasInput/types";

import LabelShiftTextInput from "smart-form/input/fancy/redditStyle/labelShiftTextInput/labelShiftTextInput.tsx";
import LabelShiftTextCustomKeyboardInput from "smart-form/input/fancy/redditStyle/labelShiftTextCustomKeyboardInput";
import HoverToolTip from "cyber-components/interactable/information/hoverToolTip/hoverToolTip.tsx";
import TextInputValidatorFactory from "smart-form/commonValidatorFactory/textValidatorFactory/textValidatorFactory.ts";
import {IPA_CHARACTERS} from "cyber-components/interactable/customKeyboard/ipaCharacters";
import {AncestryInput} from "../customInput/ancestryInput";
import {flex} from "utils-styles";
import styles from "./LexiconFormFields.module.scss";
import {GlyphCanvasInput} from "@src/components/form/customInput/glyphCanvasInput";

export interface LexiconFormFieldsProps {
    /** SmartForm's registerField function */
    registerField: (name: string, options: any) => registerFieldReturnType;
    /** Mode: 'create' for new entries, 'edit' for existing entries */
    mode: 'create' | 'edit';
    /** Initial data for edit mode */
    initialData?: LexiconComplete | null;
    /** Optional class name for the container */
    className?: string;
    /**
     * Callback when spelling changes (for parent to track).
     * @deprecated Use onGlyphOrderChange for Two-List Architecture support
     */
    onSpellingChange?: (graphemeIds: number[]) => void;
    /**
     * Callback when spelling changes with glyph_order format (Two-List Architecture).
     * This is the preferred method for getting spelling data.
     * @param glyphOrder - Array in glyph_order format: ["grapheme-123", "ə", ...]
     */
    onGlyphOrderChange?: (glyphOrder: SpellingEntry[]) => void;
    /** Callback when ancestors change (for parent to track) */
    onAncestorsChange?: (ancestors: LexiconAncestorFormRow[]) => void;
}

/**
 * Helper to programmatically set a SmartForm field value
 */
function setSmartFieldValue(field: registerFieldReturnType, value: string) {
    const inputEl = field.registerSmartFieldProps.ref?.current as HTMLInputElement | HTMLTextAreaElement | null;
    if (!inputEl) return false;

    inputEl.value = value;

    const isEmpty = value.trim() === '';
    field.fieldState.isEmpty.setIsEmpty(isEmpty);
    field.fieldState.isTouched.setIsTouched(true);
    field.fieldState.isChanged.setIsChanged(true);

    if (field.utils.validatorFunction) {
        const warning = field.utils.validatorFunction(value);
        field.fieldState.warning.setWarning(warning);
        field.fieldState.isInputValid.setIsInputValid(warning === null);
    }

    return true;
}

/**
 * Helper to get the current value of a SmartForm field
 */
function getSmartFieldValue(field: registerFieldReturnType): string {
    const inputEl = field.registerSmartFieldProps.ref?.current as HTMLInputElement | HTMLTextAreaElement | null;
    return inputEl?.value ?? '';
}

export default function LexiconFormFields({
                                              registerField,
                                              mode,
                                              initialData,
                                              className,
                                              onSpellingChange,
                                              onGlyphOrderChange,
                                              onAncestorsChange,
                                          }: LexiconFormFieldsProps) {
    const {api, data} = useEtymolog();

    // Track if we've initialized the form with initial data
    const initializedRef = useRef(false);

    // Available data from context
    const availableGraphemes = data.graphemesComplete ?? [];
    const availableLexicon = data.lexiconComplete ?? [];

    // Internal state for complex fields
    // Track both the legacy spellingIds and new glyph_order format
    const [spellingIds, setSpellingIds] = useState<number[]>(() =>
        initialData?.spelling?.map(g => g.id) ?? []
    );

    // glyph_order is the source of truth for Two-List Architecture
    const [glyphOrder, setGlyphOrder] = useState<SpellingEntry[]>(() => {
        if (initialData?.glyph_order) {
            return deserializeGlyphOrder(initialData.glyph_order);
        }
        // Fallback to legacy spelling
        return initialData?.spelling?.map(g => `grapheme-${g.id}`) ?? [];
    });

    const [ancestors, setAncestors] = useState<LexiconAncestorFormRow[]>(() =>
        initialData?.ancestors?.map(a => ({
            ancestorId: a.ancestor.id,
            ancestryType: a.ancestry_type,
        })) ?? []
    );

    const [isNative, setIsNative] = useState<boolean>(
        initialData?.is_native ?? true
    );

    const [autoSpellEnabled, setAutoSpellEnabled] = useState<boolean>(
        initialData?.auto_spell ?? true
    );

    const [autoSpellPreview, setAutoSpellPreview] = useState<AutoSpellResultExtended | null>(null);

    // Virtual glyphs from auto-spell (for IPA fallback characters)
    const [autoSpellVirtualGlyphs, setAutoSpellVirtualGlyphs] = useState<Map<number, VirtualGlyph>>(new Map());

    // Memoized callback for GlyphCanvasInput to prevent infinite loops
    // Now receives glyph_order format as third parameter
    const handleSpellingChange = useCallback((ids: number[], _hasVirtualGlyphs?: boolean, newGlyphOrder?: SpellingEntry[]) => {
        setSpellingIds(ids);
        if (newGlyphOrder) {
            setGlyphOrder(newGlyphOrder);
        }
    }, []);

    // Notify parent of spelling changes (legacy format)
    useEffect(() => {
        onSpellingChange?.(spellingIds);
    }, [spellingIds, onSpellingChange]);

    // Notify parent of glyph_order changes (Two-List Architecture)
    useEffect(() => {
        onGlyphOrderChange?.(glyphOrder);
    }, [glyphOrder, onGlyphOrderChange]);

    // Notify parent of ancestor changes
    useEffect(() => {
        onAncestorsChange?.(ancestors);
    }, [ancestors, onAncestorsChange]);

    // Validation for lemma
    const lemmaValidation = useMemo(() => TextInputValidatorFactory({
        required: {
            value: true,
            message: "Lemma is required"
        },
    }), []);

    // Register fields
    const lemmaField = registerField("lemma", {
        defaultValue: mode === 'edit' && initialData?.lemma ? initialData.lemma : undefined,
        validation: lemmaValidation,
    });

    const pronunciationField = registerField("pronunciation", {
        defaultValue: mode === 'edit' && initialData?.pronunciation ? initialData.pronunciation : undefined,
    });

    const meaningField = registerField("meaning", {
        defaultValue: mode === 'edit' && initialData?.meaning ? initialData.meaning : undefined,
    });

    const partOfSpeechField = registerField("partOfSpeech", {
        defaultValue: mode === 'edit' && initialData?.part_of_speech ? initialData.part_of_speech : undefined,
    });

    const notesField = registerField("notes", {
        defaultValue: mode === 'edit' && initialData?.notes ? initialData.notes : undefined,
    });

    const spellingField = registerField("spelling", {
        defaultValue: spellingIds,
    });

    const ancestryField = registerField("ancestry", {
        defaultValue: ancestors,
    });

    // Set initial values for edit mode
    useEffect(() => {
        if (mode === 'edit' && initialData && !initializedRef.current) {
            initializedRef.current = true;

            setTimeout(() => {
                if (initialData.lemma) {
                    setSmartFieldValue(lemmaField, initialData.lemma);
                }
                if (initialData.pronunciation) {
                    setSmartFieldValue(pronunciationField, initialData.pronunciation);
                }
                if (initialData.meaning) {
                    setSmartFieldValue(meaningField, initialData.meaning);
                }
                if (initialData.part_of_speech) {
                    setSmartFieldValue(partOfSpeechField, initialData.part_of_speech);
                }
                if (initialData.notes) {
                    setSmartFieldValue(notesField, initialData.notes);
                }
            }, 0);
        }
    }, [mode, initialData, lemmaField, pronunciationField, meaningField, partOfSpeechField, notesField]);

    // Handle auto-spell request
    const handleRequestAutoSpell = useCallback(() => {
        const pronunciation = getSmartFieldValue(pronunciationField);
        if (!pronunciation.trim()) {
            setAutoSpellPreview({
                success: false,
                spelling: [],
                segments: [],
                unmatchedParts: [],
                error: 'Enter a pronunciation first',
                hasVirtualGlyphs: false,
            });
            setAutoSpellVirtualGlyphs(new Map());
            return;
        }

        const result = api.lexicon.previewAutoSpelling(pronunciation);
        if (result.success && result.data) {
            setAutoSpellPreview(result.data);
            // Build virtual glyph map if the result contains virtual glyphs
            if (result.data.hasVirtualGlyphs) {
                const virtualMap = buildVirtualGlyphMap(result.data);
                setAutoSpellVirtualGlyphs(virtualMap as Map<number, VirtualGlyph>);
            } else {
                setAutoSpellVirtualGlyphs(new Map());
            }
        } else {
            setAutoSpellPreview({
                success: false,
                spelling: [],
                segments: [],
                unmatchedParts: [],
                error: result.error?.message ?? 'Auto-spell failed',
                hasVirtualGlyphs: false,
            });
            setAutoSpellVirtualGlyphs(new Map());
        }
    }, [pronunciationField, api]);

    // Cycle detection function
    const checkCycle = useCallback((lexiconId: number, ancestorId: number): boolean => {
        const result = api.lexicon.wouldCreateCycle(lexiconId, ancestorId);
        return result.success ? result.data ?? false : false;
    }, [api]);

    // Use efficient descendant retrieval for exclusion if available
    const [descendantIds, setDescendantIds] = useState<number[]>([]);
    // Full ancestry tree for preview
    const [ancestryTree, setAncestryTree] = useState<LexiconAncestryNode | null>(null);

    useEffect(() => {
        if (!initialData?.id) return;

        // Fetch descendants to exclude from selection
        const descResult = api.lexicon.getAllDescendantIds(initialData.id);
        if (descResult.success && descResult.data) {
           setDescendantIds(descResult.data);
        }

        // Fetch full ancestry tree for preview
        const treeResult = api.lexicon.getAncestryTree(initialData.id);
        if (treeResult.success && treeResult.data) {
            setAncestryTree(treeResult.data);
        }
    }, [initialData?.id, api]);

    // Exclude IDs for ancestry selection (self + already selected + descendants)
    const excludeAncestorIds = useMemo(() => {
        const ids = ancestors.map(a => a.ancestorId);
        if (initialData?.id) {
            ids.push(initialData.id);
            // Also exclude all descendants to prevent cycles at the root
            // (Only relevant if we have existing descendants, since closure table catches cycle attempts
            // but hiding them in dropdown is better UX)
            if (descendantIds.length > 0) {
                ids.push(...descendantIds);
            }
        }
        return ids;
    }, [ancestors, initialData?.id, descendantIds]);

    // Sync ancestry tree with selected ancestors to show deep history
    useEffect(() => {
        // Find ancestors that are not yet in the ancestryTree
        const currentAncestorIds = new Set(ancestryTree?.ancestors?.map(a => a.entry.id) ?? []);
        const missingAncestors = ancestors.filter(a => !currentAncestorIds.has(a.ancestorId));

        if (missingAncestors.length === 0) return;

        // Fetch missing ancestry trees
        const fetchMissing = () => {
             const newTrees: LexiconAncestryNode[] = [];
             let hasNewData = false;

             for (const ancestor of missingAncestors) {
                 const result = api.lexicon.getAncestryTree(ancestor.ancestorId);
                 if (result.success && result.data) {
                     newTrees.push({
                         ...result.data,
                         ancestry_type: ancestor.ancestryType
                     });
                     hasNewData = true;
                 }
             }

             if (hasNewData) {
                 setAncestryTree(prev => {
                     // If we don't have a tree yet, create a shell for the current word
                     const baseEntry = prev?.entry ?? {
                         id: initialData?.id ?? -1,
                         lemma: getSmartFieldValue(lemmaField) || 'New Word',
                         is_native: true,
                         auto_spell: false,
                         meaning: null,
                         part_of_speech: null,
                         notes: null,
                         pronunciation: null,
                         glyph_order: "[]",
                         needs_attention: false,
                         created_at: new Date().toISOString(),
                         updated_at: new Date().toISOString()
                     };

                     return {
                         entry: baseEntry,
                         ancestors: [
                             ...(prev?.ancestors ?? []),
                             ...newTrees
                         ]
                     };
                 });
             }
        };

        fetchMissing();
    }, [ancestors, ancestryTree, api, initialData, lemmaField]);

    return (
        <div className={classNames(styles.formFields, className)}>
            {/* Basic Info Section */}
            <div className={styles.section}>
                {/* Spelling Section */}
                <div className={styles.section}>
                    <h3 className={styles.sectionHeader}>Spelling</h3>

                    <GlyphCanvasInput
                        {...spellingField}
                        availableGlyphs={availableGraphemes}
                        defaultValue={spellingIds}
                        initialGlyphOrder={glyphOrder}
                        onSelectionChange={handleSpellingChange}
                        autoSpellPreview={autoSpellEnabled ? autoSpellPreview : null}
                        onRequestAutoSpell={autoSpellEnabled ? handleRequestAutoSpell : undefined}
                        enableIpaMode={true}
                        initialVirtualGlyphs={autoSpellVirtualGlyphs}
                    />

                    {/* Hidden state sync */}
                    <input type="hidden" name="isNative" value={isNative.toString()}/>
                    <input type="hidden" name="autoSpell" value={autoSpellEnabled.toString()}/>
                </div>

                <h3 className={styles.sectionHeader}>Basic Information</h3>

                <div className={classNames(flex.flexCol, flex.flexGapM)}>
                    {/* Lemma (required) */}
                    <HoverToolTip content="The citation form or dictionary headword for this word">
                        <LabelShiftTextInput
                            displayName="Lemma"
                            asInput={true}
                            {...lemmaField}
                        />
                    </HoverToolTip>

                    {/* Pronunciation (IPA) */}
                    <HoverToolTip content="IPA pronunciation (optional for external words)">
                        <LabelShiftTextCustomKeyboardInput
                            displayName="Pronunciation"
                            characters={IPA_CHARACTERS}
                            {...pronunciationField}
                        />
                    </HoverToolTip>

                    {/* Meaning */}
                    <HoverToolTip content="Definition or gloss">
                        <LabelShiftTextInput
                            displayName="Meaning"
                            asInput={true}
                            {...meaningField}
                        />
                    </HoverToolTip>

                    {/* Part of Speech */}
                    <HoverToolTip content="Part of speech (e.g., noun, verb, adjective)">
                        <LabelShiftTextInput
                            displayName="Part of Speech"
                            asInput={true}
                            {...partOfSpeechField}
                        />
                    </HoverToolTip>

                    {/* Notes */}
                    <HoverToolTip content="Additional notes, usage examples, or comments">
                        <LabelShiftTextInput
                            displayName="Notes"
                            asInput={false}
                            {...notesField}
                        />
                    </HoverToolTip>
                </div>
            </div>

            {/* Options Section */}
            <div className={styles.section}>
                <h3 className={styles.sectionHeader}>Options</h3>

                <div className={styles.checkboxRow}>
                    <label className={styles.checkboxLabel}>
                        <input
                            type="checkbox"
                            checked={isNative}
                            onChange={(e) => setIsNative(e.target.checked)}
                        />
                        <span>Native Word</span>
                    </label>
                    <HoverToolTip
                        content="Check if this word is native to the conlang. External/borrowed words may not have pronunciation.">
                        <span className={styles.helpIcon}>?</span>
                    </HoverToolTip>
                </div>

                <div className={styles.checkboxRow}>
                    <label className={classNames(styles.checkboxLabel, {[styles.disabled]: !isNative})}>
                        <input
                            type="checkbox"
                            checked={autoSpellEnabled && isNative}
                            onChange={(e) => setAutoSpellEnabled(e.target.checked)}
                            disabled={!isNative}
                        />
                        <span>Auto-Spell</span>
                    </label>
                    <HoverToolTip content="Automatically generate spelling from pronunciation using grapheme mappings.">
                        <span className={styles.helpIcon}>?</span>
                    </HoverToolTip>
                </div>

                {!isNative && (
                    <div className={styles.externalNote}>
                        External word: pronunciation is optional and auto-spell is disabled.
                    </div>
                )}
            </div>

            {/* Etymology Section */}
            <div className={styles.section}>
                <h3 className={styles.sectionHeader}>Etymology</h3>

                <AncestryInput
                    {...ancestryField}
                    currentLexiconId={initialData?.id}
                    currentLemma={initialData?.lemma ?? 'New Word'}
                    availableLexicon={availableLexicon}
                    excludeIds={excludeAncestorIds}
                    checkCycle={initialData?.id ? checkCycle : undefined}
                    ancestryTree={ancestryTree}
                    defaultValue={ancestors}
                    onChange={setAncestors}
                />
            </div>
        </div>
    );
}

/**
 * Type for the form data produced by LexiconFormFields
 */
export interface LexiconFormDataOutput {
    lemma: string;
    pronunciation?: string;
    meaning?: string;
    partOfSpeech?: string;
    notes?: string;
    isNative: boolean;
    autoSpell: boolean;
    /** @deprecated Use glyphOrder instead */
    spellingGraphemeIds: number[];
    /** glyph_order format for Two-List Architecture */
    glyphOrder: SpellingEntry[];
    ancestors: LexiconAncestorFormRow[];
}
