/**
 * LexiconFormFields
 * -------------------
 * Shared form fields for creating and editing lexicon entries.
 *
 * Four sections, in the order they can actually be filled in:
 *
 *   01 Basic information — pronunciation, Native / Auto-spell
 *   02 Meanings          — the meaning table
 *   03 Spelling          — the glyph canvas (auto-spell READS the pronunciation)
 *   04 Etymology         — ancestor rows
 *
 * Spelling used to be first, which is why the walk-through's first action on
 * the form was to press auto-spell and be told to enter a pronunciation first.
 *
 * Two-List Architecture Support:
 * - Outputs glyph_order format: ["grapheme-123", "ə", "grapheme-456"]
 * - Supports IPA fallback characters stored inline
 */

import classNames from "classnames";
import {useState, useMemo, useEffect, useRef, useCallback, useId} from "react";
import type {Lexicon, LexiconComplete, LexiconAncestorFormRow, AutoSpellResultExtended, LexiconAncestryNode} from "../../../db/types";
import type {registerFieldReturnType} from "smart-form/types";
import {useEtymolog} from "../../../db";
import {buildVirtualGlyphMap} from "../../../db/autoSpellService";
import {deserializeGlyphOrder, type SpellingEntry} from "../../../db/utils/spellingUtils";
import type {VirtualGlyph} from "../customInput/glyphCanvasInput/types";

import LabelShiftTextCustomKeyboardInput from "smart-form/input/fancy/redditStyle/labelShiftTextCustomKeyboardInput";
import TextInputValidatorFactory from "smart-form/commonValidatorFactory/textValidatorFactory/textValidatorFactory";
import HoverToolTip from "cyber-components/interactable/information/hoverToolTip/hoverToolTip.tsx";
import NumberedSectionHeader from "cyber-components/graphics/decor/numbered-section-header";
import {FieldHelp} from "../../shared";
import {IPA_CHARACTERS} from "cyber-components/interactable/customKeyboard/ipaCharacters";
import {AncestryInput} from "../customInput/ancestryInput";
import {MeaningTableInput} from "../customInput/meaningTableInput";
import {flex} from "utils-styles";
import styles from "./LexiconFormFields.module.scss";
import {GlyphCanvasInput} from "@src/components/form/customInput/glyphCanvasInput";

export interface LexiconFormFieldsProps {
    /**
     * SmartForm's `registerField`. The options bag is deliberately
     * `Record<string, unknown>` rather than `any`: every option this component
     * passes (`defaultValue`, `validation`) is structurally checked at the call
     * site, and `any` here silently disabled checking of the whole call.
     */
    registerField: (name: string, options: Record<string, unknown>) => registerFieldReturnType;
    /** Mode: 'create' for new entries, 'edit' for existing entries */
    mode: 'create' | 'edit';
    /** Initial data for edit mode */
    initialData?: LexiconComplete | null;
    /**
     * A pronunciation to start a NEW word from — the word generator's
     * "Edit & add" link (`/lexicon/create?pronunciation=…`).
     *
     * It is a suggestion, not a change: the field is filled and auto-spell
     * works on it immediately, but the form is NOT marked changed, so a user
     * who follows the link and then leaves is not asked to confirm discarding
     * something they never typed. Ignored in edit mode, where `initialData`
     * owns the field.
     */
    initialPronunciation?: string;
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
    /** Callback when isNative changes */
    onIsNativeChange?: (isNative: boolean) => void;
    /** Callback when autoSpell changes */
    onAutoSpellChange?: (autoSpell: boolean) => void;
}

/**
 * Helper to programmatically set a SmartForm field value.
 *
 * `markChanged` is what separates the two callers. Loading an EXISTING word
 * into the edit form is a change to the form's contents and is announced as
 * one; PREFILLING a create form from a link is not — the form's dirty flag is
 * what `NavigationGuard` and `useRegisterUnsaved` read, and a create form that
 * is dirty before the user has typed anything asks them to confirm discarding
 * a word that does not exist yet.
 *
 * Either way `isEmpty` and the validation ARE updated, because both describe
 * what is in the field rather than what the user did: `formState.isSubmittable`
 * is `isValid && !isEmpty`, so a prefilled-but-still-"empty" field would keep
 * the submit button disabled with a filled-in form in front of it.
 */
function setSmartFieldValue(
    field: registerFieldReturnType,
    value: string,
    options: { markChanged?: boolean } = {},
) {
    const { markChanged = true } = options;
    const inputEl = field.registerSmartFieldProps.ref?.current as HTMLInputElement | HTMLTextAreaElement | null;
    if (!inputEl) return false;

    inputEl.value = value;

    const isEmpty = value.trim() === '';
    field.fieldState.isEmpty.setIsEmpty(isEmpty);
    if (markChanged) {
        field.fieldState.isTouched.setIsTouched(true);
        field.fieldState.isChanged.setIsChanged(true);
    }

    if (field.utils.validatorFunction) {
        const warning = field.utils.validatorFunction(value);
        field.fieldState._setValidation(warning);
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

export function LexiconFormFields({
                                              registerField,
                                              mode,
                                              initialData,
                                              initialPronunciation,
                                              className,
                                              onSpellingChange,
                                              onGlyphOrderChange,
                                              onAncestorsChange,
                                              onIsNativeChange,
                                              onAutoSpellChange,
                                          }: LexiconFormFieldsProps) {
    const {api, data} = useEtymolog();
    const sectionIdPrefix = useId();

    // Track if we've initialized the form with initial data
    const initializedRef = useRef(false);
    // Separate latch for the create-mode prefill: the two paths are mutually
    // exclusive (edit has `initialData`, create has the query string) but they
    // must not share a flag, or a future third caller would silently disable
    // one of them.
    const prefilledRef = useRef(false);

    /** The prefill, ignored in edit mode where the stored word owns the field. */
    const prefill = mode === 'create' ? initialPronunciation?.trim() || undefined : undefined;

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

    // Notify parent of isNative/autoSpell changes
    useEffect(() => {
        onIsNativeChange?.(isNative);
    }, [isNative, onIsNativeChange]);

    useEffect(() => {
        onAutoSpellChange?.(autoSpellEnabled);
    }, [autoSpellEnabled, onAutoSpellChange]);

    // Note: Lemma input removed from form UI. The database still stores a lemma
    // column for backwards compatibility, but users will now edit/display
    // pronunciation as the primary identifier.
    //
    // Register fields
    const pronunciationField = registerField("pronunciation", {
        // Both modes seed through `defaultValue` — it is what makes the field
        // non-empty (and therefore the form submittable) from the first render,
        // before any effect has run.
        defaultValue: mode === 'edit'
            ? (initialData?.pronunciation ? initialData.pronunciation : undefined)
            : prefill,
        validation: TextInputValidatorFactory({
            required: { value: true, message: "Pronunciation is required" },
        }),
    });

    const initialMeanings = useMemo(() => {
        if (mode === 'edit' && initialData?.meanings && initialData.meanings.length > 0) {
            return initialData.meanings.map(m => ({
                meaning: m.meaning,
                part_of_speech: m.part_of_speech ?? undefined,
                usage_notes: m.usage_notes ?? undefined,
            }));
        }
        if (mode === 'edit' && initialData?.meaning) {
            return [{ meaning: initialData.meaning }];
        }
        return undefined;
    }, [mode, initialData]);

    const meaningsField = registerField("meanings", {
        defaultValue: initialMeanings,
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
                // Lemma field removed. Initialize pronunciation and other fields.
                if (initialData.pronunciation) {
                    setSmartFieldValue(pronunciationField, initialData.pronunciation);
                }
                // Meanings are now handled by MeaningTableInput, which is initialized via defaultValue
            }, 0);
        }
    }, [mode, initialData, pronunciationField]);

    /**
     * Create-mode prefill (`/lexicon/create?pronunciation=…`).
     *
     * `defaultValue` alone is not enough: the composite input renders its own
     * `<input>` and SmartForm's seeded value does not reliably reach that DOM
     * node, and auto-spell reads the DOM node (`getSmartFieldValue`) — so
     * without this the field could look filled while "Auto-spell" answered
     * "Enter a pronunciation first".
     *
     * `markChanged: false` is the whole point of the prefill being a prefill:
     * arriving from the generator and leaving again must not trigger the
     * unsaved-changes guard. The `setTimeout` mirrors the edit-mode effect —
     * the value lands after the input has mounted its ref, and the state
     * updates happen outside the effect's own render pass.
     *
     * The latch is set INSIDE the timer, not before it. Setting it up front
     * made the write dead code under StrictMode (`src/main.tsx` wraps the app
     * in it): React runs a mount effect create → destroy → create, the cleanup
     * cancelled the pending timer, and the second run then saw a latch that was
     * already true and scheduled nothing — so the DOM write never happened at
     * all and only `defaultValue` was holding the field up. Latching on the
     * WRITE instead means the timer is simply rescheduled by the second run and
     * still fires exactly once (this effect re-runs on every render —
     * `pronunciationField` is a fresh object each time — and each re-run clears
     * the previous timer before scheduling its own).
     */
    useEffect(() => {
        if (mode !== 'create' || !prefill || prefilledRef.current) return;

        const timer = setTimeout(() => {
            prefilledRef.current = true;
            setSmartFieldValue(pronunciationField, prefill, { markChanged: false });
        }, 0);
        return () => clearTimeout(timer);
    }, [mode, prefill, pronunciationField]);

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
        if (!missingAncestorsExist()) return;

        // Fetch missing ancestry trees and merge into existing tree
        const newTrees: LexiconAncestryNode[] = [];
        let hasNewData = false;

        for (const ancestor of ancestors) {
            // If ancestor already present in ancestryTree, skip
            const existingIds = new Set(ancestryTree?.ancestors?.map(a => a.entry.id) ?? []);
            if (existingIds.has(ancestor.ancestorId)) continue;

            const result = api.lexicon.getAncestryTree(ancestor.ancestorId);
            if (result.success && result.data) {
                newTrees.push({ ...result.data, ancestry_type: ancestor.ancestryType });
                hasNewData = true;
            }
        }

        if (!hasNewData) return;

        setAncestryTree(prev => {
            // Create a base entry shell if we don't have one yet
            const baseEntry = prev?.entry ?? {
                id: initialData?.id ?? -1,
                // Use pronunciation as display placeholder when lemma input removed
                lemma: getSmartFieldValue(pronunciationField) || 'New Word',
                is_native: true,
                auto_spell: false,
                meaning: null,
                part_of_speech: null,
                notes: null,
                pronunciation: null,
                glyph_order: "[]",
                needs_attention: false,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            } as Lexicon;

            return {
                entry: baseEntry,
                ancestors: [
                    ...(prev?.ancestors ?? []),
                    ...newTrees
                ]
            } as LexiconAncestryNode;
        });

        function missingAncestorsExist() {
            const currentAncestorIds = new Set(ancestryTree?.ancestors?.map(a => a.entry.id) ?? []);
            return ancestors.some(a => !currentAncestorIds.has(a.ancestorId));
        }
    }, [ancestors, ancestryTree, api, initialData, pronunciationField]);

    /**
     * SECTION ORDER — Basic information → Meanings → Spelling → Etymology.
     *
     * Spelling used to come FIRST, which made the form impossible to fill in
     * the order it is read: the auto-spell preview derives the spelling FROM
     * the pronunciation, so the user met the spelling canvas before typing the
     * thing it reads, pressed "auto-spell", and got "Enter a pronunciation
     * first". The options that govern spelling (Native / Auto-spell) now sit in
     * Basic information, ahead of the canvas they control.
     */
    return (
        <div className={classNames(styles.formFields, className)}>
            <section className={styles.section} aria-labelledby={`${sectionIdPrefix}-basic`}>
                <NumberedSectionHeader
                    number="01"
                    title="Basic information"
                    // The component renders an <h2>; this page's PageHeader owns
                    // the h2 level, so the section headings are level 3.
                    parts={{ title: { id: `${sectionIdPrefix}-basic`, 'aria-level': 3 } }}
                />

                <div className={classNames(flex.flexColumn, flex.flexGapM)}>
                    <HoverToolTip content="IPA pronunciation (optional for external words)">
                        <LabelShiftTextCustomKeyboardInput
                            displayName="Pronunciation"
                            characters={IPA_CHARACTERS}
                            {...pronunciationField}
                        />
                    </HoverToolTip>

                    <div className={styles.checkboxRow}>
                        <label className={styles.checkboxLabel}>
                            <input
                                type="checkbox"
                                checked={isNative}
                                onChange={(e) => setIsNative(e.target.checked)}
                            />
                            <span>Native word</span>
                        </label>
                        {/* Was a `<span title="…">?` — invisible to keyboard
                            users, unreliable for screen readers, impossible on
                            touch. `FieldHelp` is a real button. */}
                        <FieldHelp
                            label="What a native word is"
                            text="Check this if the word is native to the conlang. External or borrowed words may have no pronunciation, and cannot be auto-spelled."
                        />
                    </div>

                    <div className={styles.checkboxRow}>
                        <label
                            className={classNames(styles.checkboxLabel, {
                                [styles.disabled]: !isNative,
                            })}
                        >
                            <input
                                type="checkbox"
                                checked={autoSpellEnabled && isNative}
                                onChange={(e) => setAutoSpellEnabled(e.target.checked)}
                                disabled={!isNative}
                            />
                            <span>Auto-spell</span>
                        </label>
                        <FieldHelp
                            label="What auto-spelling does"
                            text="Generates the spelling from the pronunciation using your grapheme-to-phoneme mappings. Type the pronunciation first, then use the auto-spell control in the Spelling section."
                        />
                    </div>

                    {!isNative && (
                        <p className={styles.externalNote}>
                            External word: pronunciation is optional and auto-spell is disabled.
                        </p>
                    )}
                </div>
            </section>

            <section className={styles.section} aria-labelledby={`${sectionIdPrefix}-meanings`}>
                <NumberedSectionHeader
                    number="02"
                    title="Meanings"
                    parts={{ title: { id: `${sectionIdPrefix}-meanings`, 'aria-level': 3 } }}
                />

                <HoverToolTip content="Multiple definitions or glosses for this word">
                    <MeaningTableInput {...meaningsField} defaultValue={initialMeanings} />
                </HoverToolTip>
            </section>

            <section className={styles.section} aria-labelledby={`${sectionIdPrefix}-spelling`}>
                <NumberedSectionHeader
                    number="03"
                    title="Spelling"
                    parts={{ title: { id: `${sectionIdPrefix}-spelling`, 'aria-level': 3 } }}
                />

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
            </section>

            <section className={styles.section} aria-labelledby={`${sectionIdPrefix}-etymology`}>
                <NumberedSectionHeader
                    number="04"
                    title="Etymology"
                    parts={{ title: { id: `${sectionIdPrefix}-etymology`, 'aria-level': 3 } }}
                />

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
            </section>
        </div>
    );
}

// Also provide default export for backward compatibility
export default LexiconFormFields;

 /**
  * Type for the form data produced by LexiconFormFields
  */
 export interface LexiconFormDataOutput {
     pronunciation?: string;
     meanings?: Array<{ meaning: string; part_of_speech?: string; usage_notes?: string }>;
     isNative: boolean;
     autoSpell: boolean;
     /** @deprecated Use glyphOrder instead */
     spellingGraphemeIds: number[];
     /** glyph_order format for Two-List Architecture */
     glyphOrder: SpellingEntry[];
     ancestors: LexiconAncestorFormRow[];
 }
