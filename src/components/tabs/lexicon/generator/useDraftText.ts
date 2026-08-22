/**
 * @fileoverview `useDraftText` — a text input over a persisted value.
 *
 * The generator's profile lives in settings and every change is written there,
 * which is fine for a switch and wrong for a text box: persisting per keystroke
 * validates and re-serialises the entire settings object ten times a second,
 * and an input whose value round-trips through a write cannot hold text that
 * does not parse yet — the user would be unable to type `CVC` because `CV`…`CVC`
 * passes through nothing invalid, but could never type `[a i]` because `[` alone
 * is a syntax error and would be rejected on the way in.
 *
 * So the DOM holds the in-progress text and settings hold the truth. The draft
 * is tagged with the committed value it was started from, which is what makes it
 * self-clearing: the moment the underlying value changes for any other reason —
 * the debounced write landing, a preset being applied, an import — the tag no
 * longer matches and the input snaps to the real value instead of showing a
 * stale edit the user cannot see is stale.
 *
 * ```
 *   keystroke ──► draft (shown) ──► canCommit? ──► debounced write ──► settings
 *                                        │                                │
 *                                        └── no: text stays, nothing persisted
 *   blur ─────► flush the pending write, drop the draft (unless invalid)
 * ```
 *
 * A `.ts` module: `react-refresh/only-export-components` keeps hooks out of
 * component files.
 *
 * @module tabs/lexicon/generator/useDraftText
 */

import { useCallback, useState } from 'react';

export interface DraftTextOptions {
    /**
     * A value whose IDENTITY changes whenever the thing being edited is
     * rewritten from outside — in practice the profile object, which every
     * settings write replaces.
     *
     * Tagging the draft with the committed STRING alone is not enough, and the
     * hole is not theoretical: a user typing `CVX` over a `CV` who then applies
     * a preset whose first shape is also `CV` would see their broken draft
     * survive, with an error under it, on top of a profile that says something
     * else entirely. The identity check closes that.
     *
     * The input's OWN debounced write also changes the identity, which drops
     * the draft — harmlessly, because at that moment the stored value is
     * exactly what the user typed.
     */
    epoch?: unknown;
    /** Persist the text. Normally the debounced writer. */
    commit: (next: string) => void;
    /** Write any pending debounced value now. Called on blur. */
    flush?: () => void;
    /**
     * Whether this text may be persisted at all.
     *
     * Returning `false` keeps the text on screen and writes nothing — the
     * inline error is shown next to the input, and the last value that DID
     * parse stays in settings. Without this, an invalid template would either
     * be persisted (and then dropped by the settings validator, which the user
     * would experience as their typing vanishing) or the input would refuse
     * their keystroke.
     */
    canCommit?: (next: string) => boolean;
}

export interface DraftText {
    /** What the input shows: the draft while one is live, the stored value otherwise. */
    value: string;
    /** `onChange` handler — pass the new text. */
    change: (next: string) => void;
    /** `onBlur` handler. */
    blur: () => void;
    /** Whether an uncommitted edit is on screen. */
    isDirty: boolean;
}

/**
 * Hold a transient edit over a persisted string.
 *
 * @param committed the value in settings — the source of truth
 * @param options   how to persist, and whether the current text may be
 */
export function useDraftText(committed: string, options: DraftTextOptions): DraftText {
    const { commit, flush, canCommit, epoch } = options;
    const [draft, setDraft] = useState<
        { base: string; text: string; epoch: unknown } | null
    >(null);

    // A draft only survives while the value it was started from is still the
    // stored one AND nothing has rewritten the profile since. Either failing
    // means the world moved under the edit.
    const active =
        draft !== null && draft.base === committed && Object.is(draft.epoch, epoch)
            ? draft
            : null;

    const change = useCallback(
        (next: string) => {
            setDraft({
                base: active ? active.base : committed,
                text: next,
                epoch: active ? active.epoch : epoch,
            });
            if (!canCommit || canCommit(next)) commit(next);
        },
        [active, committed, epoch, canCommit, commit],
    );

    const blur = useCallback(() => {
        flush?.();
        // An invalid draft is KEPT on blur: dropping it would replace what the
        // user typed with the last value that parsed, with no explanation.
        setDraft((current) =>
            current !== null && canCommit && !canCommit(current.text) ? current : null,
        );
    }, [canCommit, flush]);

    return {
        value: active ? active.text : committed,
        change,
        blur,
        isDirty: active !== null && active.text !== committed,
    };
}
