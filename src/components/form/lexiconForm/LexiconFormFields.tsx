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
import type {Lexicon, LexiconComplete, LexiconAncestorFormRow, LexiconAncestryNode} from "../../../db/types";
import type {registerFieldReturnType} from "smart-form/types";
import {useEtymolog} from "../../../db";
import {
    autoSpellToGlyphOrder,
    deserializeGlyphOrder,
    serializeGlyphOrder,
    type SpellingEntry,
} from "../../../db/utils/spellingUtils";
import {LIMITS} from "../../../db/utils/sanitize";
import {wordSymbolGraphemeId} from "../../../db/wordSymbolService";
import type {GlyphCanvasInputRef, LockedSpelling} from "../customInput/glyphCanvasInput/types";

import LabelShiftTextCustomKeyboardInput from "smart-form/input/fancy/redditStyle/labelShiftTextCustomKeyboardInput";
import TextInputValidatorFactory from "smart-form/commonValidatorFactory/textValidatorFactory/textValidatorFactory";
import HoverToolTip from "cyber-components/interactable/information/hoverToolTip/hoverToolTip.tsx";
import NumberedSectionHeader from "cyber-components/graphics/decor/numbered-section-header";
import Button, {buttonStyles} from "cyber-components/interactable/buttons/button";
import {FieldHelp, useConfirm} from "../../shared";
import {IPA_CHARACTERS} from "cyber-components/interactable/customKeyboard/ipaCharacters";
import {AncestryInput} from "../customInput/ancestryInput";
import {MeaningTableInput} from "../customInput/meaningTableInput";
import {FolderTreeSelect} from "../../tabs/lexicon/folders";
import type {GlyphImportMode} from "../glyphImport";
import LogogramPanel, {type LogogramChoice, type LogogramTab} from "./LogogramPanel";
import { isImageImportSvg } from "./logogramUtils";
import {flex} from "utils-styles";
import styles from "./LexiconFormFields.module.scss";
import {GlyphCanvasInput} from "@src/components/form/customInput/glyphCanvasInput";

/** How a word's spelling is authored: composed from graphemes, or as ONE logogram. */
export type SpellingMode = 'compose' | 'logogram';

/**
 * What the Logogram tab resolves to: an existing grapheme or glyph, or a new
 * drawing (SVG markup, drawn or imported).
 */
export type LogogramSource = LogogramChoice | { kind: 'draw'; svg: string };

/**
 * The logogram state the fields report to the editor, which turns it into the
 * right write on submit: a grapheme is referenced as is; a glyph or a drawing
 * becomes (or reuses) a logogram grapheme first.
 */
export interface LexiconLogogramState {
    mode: SpellingMode;
    /** null while nothing has been chosen or drawn yet. */
    source: LogogramSource | null;
}

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
    /**
     * The folder a NEW word should default into — the `?folder=` the gallery
     * passed to `/lexicon/create` (Phase 5b, UC-D). Ignored in edit mode, where
     * `initialData.folder_id` owns the picker.
     */
    initialFolderId?: number | null;
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
    /**
     * Callback reporting whether the word currently has something to be NAMED
     * by — a non-empty pronunciation OR at least one non-empty meaning. The
     * editor gates submission on it: pronunciation is optional, but a word with
     * neither a pronunciation nor a meaning has no derivable lemma and cannot
     * be created. (SmartForm's own `isSubmittable` can't express this — the
     * spelling/ancestry array fields keep the form non-empty regardless.)
     */
    onHasNameSourceChange?: (hasNameSource: boolean) => void;
    /**
     * Callback reporting the spelling mode and, in Logogram mode, what the
     * logogram is (an existing grapheme/glyph or a new drawing). The editor
     * turns it into the right create/update on save.
     */
    onLogogramStateChange?: (state: LexiconLogogramState) => void;
    /**
     * Callback reporting the chosen folder id (schema v7), or null for the root
     * level. Like Native / Auto-spell it is plain reported-up state, not a
     * SmartForm field — so it stays clear of the dirty-on-mount latch machinery.
     */
    onFolderIdChange?: (folderId: number | null) => void;
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
                                              initialFolderId,
                                              className,
                                              onSpellingChange,
                                              onGlyphOrderChange,
                                              onAncestorsChange,
                                              onIsNativeChange,
                                              onAutoSpellChange,
                                              onHasNameSourceChange,
                                              onLogogramStateChange,
                                              onFolderIdChange,
                                          }: LexiconFormFieldsProps) {
    const {api, data} = useEtymolog();
    const sectionIdPrefix = useId();
    const confirm = useConfirm();

    // Track if we've initialized the form with initial data
    const initializedRef = useRef(false);
    // Separate latch for the create-mode prefill: the two paths are mutually
    // exclusive (edit has `initialData`, create has the query string) but they
    // must not share a flag, or a future third caller would silently disable
    // one of them.
    const prefilledRef = useRef(false);

    /** The prefill, ignored in edit mode where the stored word owns the field. */
    const prefill = mode === 'create' ? initialPronunciation?.trim() || undefined : undefined;

    // Available data from context. `graphemesComplete` is memoised so the
    // symbol-inference memos below don't see a fresh `?? []` identity every
    // render (react-hooks/exhaustive-deps).
    const graphemesComplete = data.graphemesComplete;
    const availableGraphemes = useMemo(() => graphemesComplete ?? [], [graphemesComplete]);
    // Memoised for the same reason as `availableGraphemes`: the
    // ancestor-spelling memo below keys on it, and a fresh `?? []` identity
    // every render would recompute it needlessly (react-hooks/exhaustive-deps).
    const lexiconComplete = data.lexiconComplete;
    const availableLexicon = useMemo(() => lexiconComplete ?? [], [lexiconComplete]);

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

    // Folder (schema v7). Edit mode starts from the stored word; create mode
    // from the `?folder=` the gallery passed (null = root). Plain state, like
    // Native / Auto-spell — reported up, never a SmartForm field, so seeding it
    // from a prop cannot dirty the form on mount.
    const [folderId, setFolderId] = useState<number | null>(
        mode === 'edit' ? (initialData?.folder_id ?? null) : (initialFolderId ?? null),
    );

    // -------------------------------------------------------------------------
    // Logogram mode
    // -------------------------------------------------------------------------

    /**
     * The logogram inferred from the STORED word (edit mode): a glyph_order of
     * exactly one grapheme whose category is 'logogram'. Depends on
     * `availableGraphemes`, which may load a tick after mount, so the adopt
     * effect below re-checks rather than only reading it once. A primitive, so
     * recomputing to the same id does not refire the effect.
     */
    const inferredLogogramId = useMemo((): number | null => {
        if (mode !== 'edit' || !initialData) return null;
        const order = deserializeGlyphOrder(initialData.glyph_order);
        return wordSymbolGraphemeId(
            order,
            id => availableGraphemes.find(g => g.id === id)?.category ?? null,
        );
    }, [mode, initialData, availableGraphemes]);

    const [spellingMode, setSpellingMode] = useState<SpellingMode>('compose');
    const [logogramTab, setLogogramTab] = useState<LogogramTab>('existing');
    const [logogramChoice, setLogogramChoice] = useState<LogogramChoice | null>(null);
    /** The Draw-new drawing (or imported image); kept while on the other tab. */
    const [drawSvg, setDrawSvg] = useState<string | null>(null);
    // Once the user picks a mode, the auto-adopt below must not override them.
    const modeUserSetRef = useRef(false);
    // Latch the one-shot adoption of an inferred logogram (edit open).
    const logogramAdoptedRef = useRef(false);

    // Adopt the inferred logogram once graphemes have loaded (edit open): open
    // in Logogram mode with that grapheme chosen. Local state only — the form
    // is not dirtied.
    useEffect(() => {
        if (mode !== 'edit' || inferredLogogramId === null || logogramAdoptedRef.current) return;
        logogramAdoptedRef.current = true;
        if (!modeUserSetRef.current) setSpellingMode('logogram');
        setLogogramTab('existing');
        setLogogramChoice({ kind: 'grapheme', graphemeId: inferredLogogramId });
    }, [mode, inferredLogogramId]);

    // Report the logogram state up so the editor can act on it at submit.
    useEffect(() => {
        const source: LogogramSource | null = logogramTab === 'existing'
            ? logogramChoice
            : (drawSvg ? { kind: 'draw', svg: drawSvg } : null);
        onLogogramStateChange?.({ mode: spellingMode, source });
    }, [spellingMode, logogramTab, logogramChoice, drawSvg, onLogogramStateChange]);

    // With nothing in the script to pick, "Use existing" is a dead end: open
    // Logogram mode on "Draw new" instead (only while no logogram is chosen).
    const scriptIsEmpty = availableGraphemes.length === 0 && (data.glyphsWithUsage?.length ?? 0) === 0;
    const handleModeChange = useCallback((next: SpellingMode) => {
        modeUserSetRef.current = true;
        setSpellingMode(next);
        if (next === 'logogram' && scriptIsEmpty && logogramChoice === null) {
            setLogogramTab('draw');
        }
    }, [scriptIsEmpty, logogramChoice]);

    const handleLogogramImport = useCallback((svg: string, _importMode: GlyphImportMode) => {
        setDrawSvg(svg);
    }, []);

    const handleLogogramDraw = useCallback((svg: string | null) => {
        setDrawSvg(svg && svg.trim() ? svg : null);
    }, []);

    const handleLogogramClearImport = useCallback(() => {
        // Back to a blank drawing canvas.
        setDrawSvg(null);
    }, []);

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

    // Notify parent of folder changes
    useEffect(() => {
        onFolderIdChange?.(folderId);
    }, [folderId, onFolderIdChange]);

    // Logogram words are ALWAYS manually spelled — a logogram has no
    // pronunciation-derived spelling to regenerate — so Logogram mode forces
    // auto-spell off in what the editor submits, regardless of the toggle.
    // An external (non-native) word is never auto-spelled either.
    const effectiveAutoSpell = spellingMode === 'logogram' ? false : (isNative && autoSpellEnabled);
    useEffect(() => {
        onAutoSpellChange?.(effectiveAutoSpell);
    }, [effectiveAutoSpell, onAutoSpellChange]);

    // Note: Lemma input removed from form UI. The database still stores a lemma
    // column for backwards compatibility, but users will now edit/display
    // pronunciation as the primary identifier.
    //
    // Register fields
    const pronunciationField = registerField("pronunciation", {
        // Both modes seed through `defaultValue`; it makes the field non-empty
        // from the first render, before any effect has run, which the editor's
        // name-source gate reads.
        //
        // NO `required` validator: pronunciation is OPTIONAL now (a word can be
        // named by its meaning, or carry a symbol before its phonetics are
        // decided). Only a max-length rule remains — the same ceiling the
        // service enforces on save (`validateStringLength`) — so an over-long
        // value is caught client-side too.
        defaultValue: mode === 'edit'
            ? (initialData?.pronunciation ? initialData.pronunciation : undefined)
            : prefill,
        validation: TextInputValidatorFactory({
            maxLength: {
                value: LIMITS.PRONUNCIATION,
                message: `Pronunciation must be ${LIMITS.PRONUNCIATION} characters or fewer`,
            },
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

    // The Draw-new canvas binds to SvgDrawerInput, which needs a SmartForm
    // field. The value the EDITOR reads is `drawSvg` (reported via
    // `onLogogramStateChange`), not this field's DOM value — the field exists
    // only to drive the drawer. `defaultValue` re-seeds the drawer with the
    // current drawing each time it (re)mounts (only when it is a DRAWING, not
    // an imported image), so switching tabs back and forth keeps it without
    // dirtying the form.
    const logogramDrawField = registerField("symbolSvg", {
        defaultValue: drawSvg && !isImageImportSvg(drawSvg) ? drawSvg : undefined,
    });

    /**
     * Whether the word has a NAME SOURCE — a non-empty pronunciation or at
     * least one non-empty meaning. Read straight off the two fields' live
     * `isEmpty` flags (SmartForm re-renders this component when either flips),
     * and reported up so the editor can gate submission. It is deliberately NOT
     * `formState.isSubmittable`: the spelling and ancestry composite fields seed
     * `[]`, which SmartForm counts as non-empty, so the form is never "empty"
     * and that gate can't tell a nameable word from a blank one.
     */
    const hasNameSource =
        !pronunciationField.fieldState.isEmpty.value || !meaningsField.fieldState.isEmpty.value;

    useEffect(() => {
        onHasNameSourceChange?.(hasNameSource);
    }, [hasNameSource, onHasNameSourceChange]);

    // -------------------------------------------------------------------------
    // Build spelling from ancestors (Phase 4, UC-B2)
    // -------------------------------------------------------------------------

    /**
     * Every ancestor's stored spelling, concatenated in ancestry position
     * order (which IS the order of the `ancestors` array). Grapheme references
     * are kept as references — not copied — so a later edit to an ancestor's
     * symbol flows through to this compound automatically (the desirable
     * logographic behaviour). IPA fallback entries carry over verbatim.
     * Ancestors with an empty spelling contribute nothing.
     */
    const ancestorGlyphOrder = useMemo((): SpellingEntry[] => {
        const combined: SpellingEntry[] = [];
        for (const row of ancestors) {
            const entry = availableLexicon.find(l => l.id === row.ancestorId);
            if (!entry) continue;
            combined.push(...deserializeGlyphOrder(entry.glyph_order));
        }
        return combined;
    }, [ancestors, availableLexicon]);

    /** Nothing to build from when every ancestor's spelling is empty. */
    const canBuildFromAncestors = ancestorGlyphOrder.length > 0;

    /**
     * Drop the ancestors' concatenated spellings onto the canvas, replacing
     * whatever is there. Only offered in Compose mode with ≥1 ancestor. The
     * canvas content is replaced through the input's imperative
     * `setGlyphOrder` (the same handle SmartForm holds), which flows back up as
     * a normal spelling change. When the canvas already holds a spelling the
     * overwrite is confirmed first.
     */
    const handleBuildFromAncestors = useCallback(async () => {
        if (ancestorGlyphOrder.length === 0) return;

        const handle = spellingField.registerSmartFieldProps.ref?.current as GlyphCanvasInputRef | null;
        if (!handle?.setGlyphOrder) return;

        const current = handle.glyphOrder ?? glyphOrder;
        if (current.length > 0) {
            const ok = await confirm({
                title: 'Replace the current spelling?',
                message:
                    'The glyphs on the canvas will be replaced by the ancestors’ spellings, joined in ancestry order.',
                confirmLabel: 'Replace spelling',
                cancelLabel: 'Keep current',
                tone: 'danger',
            });
            if (!ok) return;
        }

        handle.setGlyphOrder(ancestorGlyphOrder);
    }, [ancestorGlyphOrder, glyphOrder, confirm, spellingField]);

    // Set initial values for edit mode
    useEffect(() => {
        if (mode === 'edit' && initialData && !initializedRef.current) {
            initializedRef.current = true;

            setTimeout(() => {
                // Seed the stored pronunciation. NOT a user edit: with
                // `markChanged` (the default) every edit form opened dirty and
                // leaving it untouched asked "Leave site?".
                if (initialData.pronunciation) {
                    setSmartFieldValue(pronunciationField, initialData.pronunciation, { markChanged: false });
                    setPronunciationText(initialData.pronunciation);
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
            setPronunciationText(prefill);
        }, 0);
        return () => clearTimeout(timer);
    }, [mode, prefill, pronunciationField]);

    // -------------------------------------------------------------------------
    // Auto-spell: the software owns the spelling while it is on
    // -------------------------------------------------------------------------

    /**
     * The pronunciation as typed, kept in state so the auto-spelled spelling
     * can follow it live. Fed by the input events that bubble out of Basic
     * information (typing, the on-screen IPA keyboard and its floating field
     * all dispatch a bubbling `input` on the registered field) and by the
     * programmatic writes (edit-open, prefill), which set the DOM value
     * directly and so call `syncPronunciationText` themselves.
     */
    const [pronunciationText, setPronunciationText] = useState<string>(
        () => (mode === 'edit' ? initialData?.pronunciation ?? '' : prefill ?? ''),
    );
    const syncPronunciationText = useCallback(() => {
        setPronunciationText(getSmartFieldValue(pronunciationField));
    }, [pronunciationField]);

    /** Auto-spell applies: compose mode, a native word, the toggle on. */
    const autoSpellActive = spellingMode === 'compose' && isNative && autoSpellEnabled;

    /**
     * What the speller makes of `text` against the graphemes that exist now,
     * in storage form — the same result `lexicon.create` / `lexicon.update`
     * derive on save (`deriveAutoSpelledGlyphOrder`), so the canvas shows
     * exactly what will be stored. `null` = no pronunciation to derive from.
     */
    const deriveSpelling = useCallback((text: string): SpellingEntry[] | null => {
        const trimmed = text.trim();
        if (!trimmed) return null;
        const result = api.lexicon.previewAutoSpelling(trimmed);
        return result.success && result.data?.success
            ? autoSpellToGlyphOrder(result.data.spelling)
            : null;
    }, [api]);

    // `availableGraphemes` is a deliberate dependency: a grapheme or phoneme
    // created/edited elsewhere changes it, and the auto-spelled spelling must
    // follow the script just as the stored one is respelled.
    const derivedGlyphOrder = useMemo(
        () => (autoSpellActive ? deriveSpelling(pronunciationText) : null),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [autoSpellActive, deriveSpelling, pronunciationText, availableGraphemes],
    );

    const lockedSpelling = useMemo((): LockedSpelling | null => {
        if (!autoSpellActive) return null;
        return {
            glyphOrder: derivedGlyphOrder,
            message: pronunciationText.trim()
                ? 'Auto-spell is on: this spelling is generated from the pronunciation and '
                    + 'updates by itself whenever you add or change graphemes. '
                    + 'Turn auto-spell off to edit it by hand.'
                : 'Auto-spell is on: enter a pronunciation above and the spelling is generated '
                    + 'from it. Turn auto-spell off to spell this word by hand.',
            tooltip: 'Disable auto-spell to modify the spelling',
        };
    }, [autoSpellActive, derivedGlyphOrder, pronunciationText]);

    /**
     * The wand toggle. Turning auto-spell OFF keeps the generated spelling as
     * the starting point for hand edits. Turning it ON replaces the canvas with
     * the generated spelling, so a hand-made spelling that would be lost is
     * confirmed first.
     */
    const handleAutoSpellToggle = useCallback(async (next: boolean) => {
        if (next) {
            const handle = spellingField.registerSmartFieldProps.ref?.current as GlyphCanvasInputRef | null;
            const current = handle?.glyphOrder ?? glyphOrder;
            const replacement = deriveSpelling(getSmartFieldValue(pronunciationField));
            const wouldReplace = current.length > 0
                && replacement !== null
                && serializeGlyphOrder(replacement) !== serializeGlyphOrder(current);
            if (wouldReplace) {
                const ok = await confirm({
                    title: 'Turn auto-spell on?',
                    message: 'The spelling on the canvas will be replaced by one generated from the '
                        + 'pronunciation, and it will keep updating as your graphemes change.',
                    confirmLabel: 'Use auto-spell',
                    cancelLabel: 'Keep my spelling',
                    tone: 'danger',
                });
                if (!ok) return;
            }
        }
        setAutoSpellEnabled(next);
    }, [spellingField, glyphOrder, deriveSpelling, pronunciationField, confirm]);

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

                <div className={classNames(flex.flexColumn, flex.flexGapM)} onInput={syncPronunciationText}>
                    <HoverToolTip content="IPA pronunciation — optional. A word can be named by its meaning instead.">
                        <LabelShiftTextCustomKeyboardInput
                            displayName="Pronunciation (optional)"
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

                    {!isNative && (
                        <p className={styles.externalNote}>
                            External word: pronunciation is optional and auto-spell is disabled.
                        </p>
                    )}

                    {spellingMode === 'logogram' && (
                        <p className={styles.externalNote}>
                            Logogram spelling: this word is written as one logogram, so auto-spell
                            is off.
                        </p>
                    )}

                    {/* Folder picker (Phase 5b, UC-D). Only shown once folders
                        exist — a lexicon with no folders has nothing to file
                        into, and the lone "Root" option would be noise. */}
                    {(data.folders?.length ?? 0) > 0 && (
                        <FolderTreeSelect
                            folders={data.folders ?? []}
                            value={folderId}
                            onChange={setFolderId}
                            label="Folder"
                            rootLabel="No folder (root)"
                        />
                    )}
                </div>
            </section>

            <section className={styles.section} aria-labelledby={`${sectionIdPrefix}-meanings`}>
                <NumberedSectionHeader
                    number="02"
                    title="Meanings"
                    parts={{ title: { id: `${sectionIdPrefix}-meanings`, 'aria-level': 3 } }}
                />

                <HoverToolTip content="Multiple definitions or glosses for this word. Optional if the word has a pronunciation.">
                    <MeaningTableInput {...meaningsField} defaultValue={initialMeanings} optional />
                </HoverToolTip>
            </section>

            <section className={styles.section} aria-labelledby={`${sectionIdPrefix}-spelling`}>
                <NumberedSectionHeader
                    number="03"
                    title="Spelling"
                    parts={{ title: { id: `${sectionIdPrefix}-spelling`, 'aria-level': 3 } }}
                />

                {/* Two ways to spell a word: compose it from graphemes, or write
                    it with ONE logogram (an existing grapheme/glyph or a new
                    drawing — a normal grapheme underneath either way). */}
                <div className={styles.segmented} role="group" aria-label="How to spell this word">
                    <button
                        type="button"
                        className={classNames(styles.segment, {
                            [styles.segmentActive]: spellingMode === 'compose',
                        })}
                        aria-pressed={spellingMode === 'compose'}
                        onClick={() => handleModeChange('compose')}
                    >
                        Compose from graphemes
                    </button>
                    <button
                        type="button"
                        className={classNames(styles.segment, {
                            [styles.segmentActive]: spellingMode === 'logogram',
                        })}
                        aria-pressed={spellingMode === 'logogram'}
                        onClick={() => handleModeChange('logogram')}
                    >
                        Logogram
                    </button>
                </div>

                {spellingMode === 'compose' ? (
                    <div className={classNames(flex.flexColumn, flex.flexGapM)}>
                        {/* Word chains (UC-B2): concatenate the ancestors'
                            symbols into this word's spelling in one click. Only
                            when this word has ancestors to build from. */}
                        {ancestors.length > 0 && (
                            <div className={styles.buildFromAncestors}>
                                <HoverToolTip
                                    content={autoSpellActive
                                        ? 'Disable auto-spell to modify the spelling'
                                        : 'Replace the spelling with the ancestors’ spellings, joined'}
                                >
                                    <Button
                                        type="button"
                                        themeType="basic"
                                        className={buttonStyles.secondary}
                                        onClick={handleBuildFromAncestors}
                                        disabled={!canBuildFromAncestors || autoSpellActive}
                                    >
                                        Build spelling from ancestors
                                    </Button>
                                </HoverToolTip>
                                <FieldHelp
                                    label="What building from ancestors does"
                                    text="Concatenates each ancestor word's spelling, in ancestry order, into this word's spelling. The symbols are referenced (not copied), so editing an ancestor's symbol later updates this compound too."
                                />
                            </div>
                        )}
                        {ancestors.length > 0 && !canBuildFromAncestors && (
                            <p className={styles.externalNote}>
                                {'None of this word’s ancestors have a spelling yet, so there is nothing to build from.'}
                            </p>
                        )}

                        <GlyphCanvasInput
                            {...spellingField}
                            availableGlyphs={availableGraphemes}
                            defaultValue={spellingIds}
                            initialGlyphOrder={glyphOrder}
                            onSelectionChange={handleSpellingChange}
                            autoSpell={{
                                enabled: autoSpellEnabled && isNative,
                                onToggle: handleAutoSpellToggle,
                                disabledReason: isNative
                                    ? null
                                    : 'External words cannot be auto-spelled. Mark the word as native to use auto-spell.',
                            }}
                            locked={lockedSpelling}
                            enableIpaMode={true}
                        />
                    </div>
                ) : (
                    <LogogramPanel
                        tab={logogramTab}
                        onTabChange={setLogogramTab}
                        choice={logogramChoice}
                        onChoiceChange={setLogogramChoice}
                        drawSvg={drawSvg}
                        onDraw={handleLogogramDraw}
                        onImport={handleLogogramImport}
                        onClearImport={handleLogogramClearImport}
                        drawField={logogramDrawField}
                        wordName={pronunciationText.trim() || initialData?.lemma || ''}
                        currentWordId={initialData?.id}
                        hasNameSource={hasNameSource}
                    />
                )}
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
