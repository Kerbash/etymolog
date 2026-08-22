/**
 * ShapeEditor — section 03, "Shape".
 *
 * ```
 *  [ CV      ] [ 6 ] [✕]
 *  [ CVC     ] [ 2 ] [✕]
 *  [ CVX     ] [ 1 ] [✕]   ← "X is not a sound class (position 2)"
 *  [ CVN     ] [ 0 ] [✕]   ← "How often must be between 1 and 100"
 *  [Add shape]   quick add: CV CVC CCV CVN V
 *  Syllables per word  [1 ▾] to [3 ▾]
 *  Long vowels         [——●———]  20 %
 * ```
 *
 * A template is a little language (`CV`, `(C)V(N)`, `CV[n ŋ]`) and the parser
 * that reads it is the SAME one the settings validator uses — the error under
 * the row is `isValidTemplatePattern`'s own message, not a second opinion about
 * what is legal. An invalid pattern is held in the input and never written:
 * persisting it would hand it to the validator, which drops unparseable
 * templates, and the user would experience their typing disappearing.
 *
 * The WEIGHT box works the same way and now SAYS so. Its `canCommit` has always
 * refused a value outside `LIMITS.MIN_TEMPLATE_WEIGHT..MAX_TEMPLATE_WEIGHT`
 * (and anything that is not a number), so nothing was ever persisted — but it
 * refused in silence, and a user who cleared the box and typed `0` watched a
 * number sit in an input that no longer meant anything. Same treatment as the
 * pattern: `aria-invalid`, the invalid outline, and a message underneath.
 *
 * The count selects clamp each other rather than validating: a user who sets
 * the minimum above the maximum means "at least this many", so the other end
 * moves. An error message would be technically correct and useless.
 *
 * @module tabs/lexicon/generator/ShapeEditor
 */

import { useCallback, useId } from 'react';
import classNames from 'classnames';

import {
    isValidTemplatePattern,
    LIMITS,
    type SyllableTemplate,
    type WordGeneratorProfile,
} from '../../../../generator';
import { QUICK_TEMPLATES, nextShape } from './generatorText';
import { useDraftText } from './useDraftText';
import type { ProfilePatch } from './useGeneratorProfile';

import styles from './generator.module.scss';

/** Percentage points the long-vowel slider offers. Beyond half, length stops reading as length. */
const MAX_LONG_VOWEL_PERCENT = 50;

/** Syllable counts, from the shared limits so the UI cannot offer what the validator rejects. */
const SYLLABLE_COUNTS = Array.from(
    { length: LIMITS.MAX_SYLLABLE_COUNT - LIMITS.MIN_SYLLABLE_COUNT + 1 },
    (_unused, index) => LIMITS.MIN_SYLLABLE_COUNT + index,
);

export interface ShapeEditorProps {
    profile: WordGeneratorProfile;
    /** Immediate write — switches, selects, buttons. */
    onUpdate: (patch: ProfilePatch) => void;
    /** Debounced write — the text and number inputs. */
    onUpdateDebounced: (patch: ProfilePatch) => void;
    /** Write any pending debounced value now. */
    onFlush: () => void;
}

interface TemplateRowProps {
    /** The profile, as the draft's epoch: a settings write replaces it wholesale. */
    profile: WordGeneratorProfile;
    template: SyllableTemplate;
    index: number;
    canRemove: boolean;
    onUpdateDebounced: (patch: ProfilePatch) => void;
    onUpdate: (patch: ProfilePatch) => void;
    onFlush: () => void;
}

/** Replace one template in the list, deriving from whatever the list is at write time. */
function replaceTemplate(
    index: number,
    change: Partial<SyllableTemplate>,
): (current: WordGeneratorProfile) => Partial<WordGeneratorProfile> {
    return (current) => ({
        syllables: current.syllables.map((entry, position) =>
            position === index ? { ...entry, ...change } : entry,
        ),
    });
}

function TemplateRow({
    profile,
    template,
    index,
    canRemove,
    onUpdate,
    onUpdateDebounced,
    onFlush,
}: TemplateRowProps) {
    const rowId = useId();

    const pattern = useDraftText(template.pattern, {
        epoch: profile,
        commit: (next) => onUpdateDebounced(replaceTemplate(index, { pattern: next })),
        flush: onFlush,
        // The parser is the gate. Anything it rejects stays in the input with
        // the message underneath and is never persisted.
        canCommit: (next) => next.trim().length > 0 && isValidTemplatePattern(next).ok,
    });

    const weight = useDraftText(String(template.weight), {
        epoch: profile,
        commit: (next) => {
            const parsed = Number(next);
            onUpdateDebounced(replaceTemplate(index, { weight: parsed }));
        },
        flush: onFlush,
        canCommit: (next) => {
            const parsed = Number(next);
            return (
                next.trim().length > 0
                && Number.isFinite(parsed)
                && parsed >= LIMITS.MIN_TEMPLATE_WEIGHT
                && parsed <= LIMITS.MAX_TEMPLATE_WEIGHT
            );
        },
    });

    // The error describes what is IN THE BOX, which is the draft while one is
    // live and the stored pattern otherwise.
    const shown = isValidTemplatePattern(pattern.value);
    const error = pattern.value.trim().length === 0
        ? 'A shape cannot be empty'
        : shown.ok
            ? null
            : `${shown.message} (position ${shown.position + 1})`;

    // The same test the weight draft's `canCommit` runs, so the message and the
    // refusal to persist can never disagree about what is acceptable.
    const weightNumber = Number(weight.value);
    const weightError = weight.value.trim().length === 0
        ? 'How often cannot be empty'
        // `NaN` before the range test, because NaN fails every comparison and
        // would otherwise fall through to "in range".
        : Number.isNaN(weightNumber)
            ? 'How often must be a number'
            // `Infinity` lands here rather than in the NaN branch — a number
            // input WILL hold `1e999`, and "must be between 0 and 100" is what
            // that user needs to read, not "must be a number".
            : weightNumber < LIMITS.MIN_TEMPLATE_WEIGHT || weightNumber > LIMITS.MAX_TEMPLATE_WEIGHT
                ? `How often must be between ${LIMITS.MIN_TEMPLATE_WEIGHT} and ${LIMITS.MAX_TEMPLATE_WEIGHT}`
                : null;

    return (
        <li className={styles.chipGroup}>
            <div className={styles.templateRow}>
                <label className={styles.visuallyHidden} htmlFor={`${rowId}-pattern`}>
                    {`Shape ${index + 1}`}
                </label>
                <input
                    id={`${rowId}-pattern`}
                    type="text"
                    className={classNames(styles.textInput, styles.monoInput, {
                        [styles.invalid]: error !== null,
                    })}
                    value={pattern.value}
                    maxLength={LIMITS.MAX_PATTERN_LENGTH}
                    aria-invalid={error !== null}
                    aria-describedby={error ? `${rowId}-error` : undefined}
                    onChange={(event) => pattern.change(event.target.value)}
                    onBlur={pattern.blur}
                />

                <label className={styles.visuallyHidden} htmlFor={`${rowId}-weight`}>
                    {`How often shape ${index + 1} is used`}
                </label>
                <input
                    id={`${rowId}-weight`}
                    type="number"
                    className={classNames(styles.numberInput, {
                        [styles.invalid]: weightError !== null,
                    })}
                    value={weight.value}
                    min={LIMITS.MIN_TEMPLATE_WEIGHT}
                    max={LIMITS.MAX_TEMPLATE_WEIGHT}
                    step={1}
                    aria-invalid={weightError !== null}
                    aria-describedby={weightError ? `${rowId}-weight-error` : undefined}
                    onChange={(event) => weight.change(event.target.value)}
                    onBlur={weight.blur}
                />

                <button
                    type="button"
                    className={styles.ghostButton}
                    disabled={!canRemove}
                    onClick={() =>
                        onUpdate((current) => ({
                            syllables: current.syllables.filter((_unused, position) => position !== index),
                        }))
                    }
                    aria-label={`Remove shape ${template.pattern}`}
                    // The last shape cannot go: a profile with no templates is
                    // reset to the defaults by the validator, which would look
                    // like the page undoing the user's deletion.
                    title={canRemove ? undefined : 'A profile needs at least one shape'}
                >
                    ✕
                </button>
            </div>
            {error && (
                <p className={styles.fieldError} id={`${rowId}-error`}>
                    {error}
                </p>
            )}
            {weightError && (
                <p className={styles.fieldError} id={`${rowId}-weight-error`}>
                    {weightError}
                </p>
            )}
        </li>
    );
}

export default function ShapeEditor({
    profile,
    onUpdate,
    onUpdateDebounced,
    onFlush,
}: ShapeEditorProps) {
    const fieldId = useId();

    const atTemplateLimit = profile.syllables.length >= LIMITS.MAX_TEMPLATES;
    const patterns = profile.syllables.map((entry) => entry.pattern);
    /** What the generic "Add shape" button would add, or `null` when it has nothing left. */
    const ladderNext = nextShape(patterns);

    const addTemplate = useCallback(
        (pattern: string) => {
            onUpdate((current) => {
                if (current.syllables.length >= LIMITS.MAX_TEMPLATES) return {};
                // Duplicates are refused silently: adding `CV` twice does not
                // make it twice as likely (that is what the weight is for), and
                // the settings validator drops the second copy anyway.
                if (current.syllables.some((entry) => entry.pattern === pattern)) return {};
                return { syllables: [...current.syllables, { pattern, weight: 1 }] };
            });
        },
        [onUpdate],
    );

    const setCount = useCallback(
        (edge: 'min' | 'max', value: number) => {
            onUpdate((current) => {
                const next = { ...current.syllableCount, [edge]: value };
                // Clamp the OTHER end rather than refusing: "at least 4" on a
                // profile that maxes at 3 means the maximum moves.
                if (edge === 'min' && next.max < value) next.max = value;
                if (edge === 'max' && next.min > value) next.min = value;
                return { syllableCount: next };
            });
        },
        [onUpdate],
    );

    /**
     * The slider is a DRAFT too, for a different reason than the text boxes: a
     * controlled range whose value only updates when the debounced write lands
     * snaps back to the old position under the user's thumb. The draft holds
     * the dragged position and dissolves the moment the real value catches up.
     */
    const storedPercent = String(Math.round(profile.longVowelChance * 100));
    const longVowel = useDraftText(storedPercent, {
        epoch: profile,
        commit: (next) => onUpdateDebounced({ longVowelChance: Number(next) / 100 }),
        flush: onFlush,
    });

    return (
        <>
            <ul className={styles.templateList}>
                {profile.syllables.map((template, index) => (
                    <TemplateRow
                        // Index, not the pattern: the pattern is what is being
                        // edited, so keying by it would remount the input (and
                        // lose focus) on every keystroke that lands.
                        key={index}
                        profile={profile}
                        template={template}
                        index={index}
                        canRemove={profile.syllables.length > 1}
                        onUpdate={onUpdate}
                        onUpdateDebounced={onUpdateDebounced}
                        onFlush={onFlush}
                    />
                ))}
            </ul>

            <div className={styles.templateRow}>
                <button
                    type="button"
                    className={styles.inlineButton}
                    disabled={atTemplateLimit || ladderNext === null}
                    onClick={() => {
                        if (ladderNext) addTemplate(ladderNext);
                    }}
                    title={
                        atTemplateLimit
                            ? `A profile may have ${LIMITS.MAX_TEMPLATES} shapes`
                            : undefined
                    }
                >
                    Add shape
                </button>
                <span className={styles.sectionHint}>Quick add</span>
                {QUICK_TEMPLATES.map((pattern) => (
                    <button
                        key={pattern}
                        type="button"
                        className={classNames(styles.ghostButton, styles.monoInput)}
                        disabled={
                            atTemplateLimit
                            || profile.syllables.some((entry) => entry.pattern === pattern)
                        }
                        onClick={() => addTemplate(pattern)}
                        aria-label={`Add the shape ${pattern}`}
                    >
                        {pattern}
                    </button>
                ))}
            </div>

            <div className={styles.rangeRow}>
                <label className={styles.fieldLabel} htmlFor={`${fieldId}-min`}>
                    Syllables per word
                </label>
                <select
                    id={`${fieldId}-min`}
                    className={styles.select}
                    value={profile.syllableCount.min}
                    onChange={(event) => setCount('min', Number(event.target.value))}
                >
                    {SYLLABLE_COUNTS.map((count) => (
                        <option key={count} value={count}>
                            {count}
                        </option>
                    ))}
                </select>
                <span className={styles.sectionHint}>to</span>
                <label className={styles.visuallyHidden} htmlFor={`${fieldId}-max`}>
                    Most syllables per word
                </label>
                <select
                    id={`${fieldId}-max`}
                    className={styles.select}
                    value={profile.syllableCount.max}
                    onChange={(event) => setCount('max', Number(event.target.value))}
                >
                    {SYLLABLE_COUNTS.map((count) => (
                        <option key={count} value={count}>
                            {count}
                        </option>
                    ))}
                </select>
            </div>

            <div className={styles.rangeRow}>
                <label className={styles.fieldLabel} htmlFor={`${fieldId}-long`}>
                    Long vowels
                </label>
                <input
                    id={`${fieldId}-long`}
                    type="range"
                    className={styles.range}
                    min={0}
                    max={MAX_LONG_VOWEL_PERCENT}
                    step={1}
                    value={longVowel.value}
                    // A drag fires `change` per pixel; the debounce turns that
                    // into one write per gesture instead of one per frame.
                    onChange={(event) => longVowel.change(event.target.value)}
                    onBlur={longVowel.blur}
                    onPointerUp={onFlush}
                    onKeyUp={onFlush}
                />
                <output className={styles.rangeValue} htmlFor={`${fieldId}-long`}>
                    {`${longVowel.value} %`}
                </output>
            </div>
        </>
    );
}
