/**
 * Scheme-level options of the Block Designer — how words are split into
 * blocks (`split`) and how a consonant left in no block is drawn
 * (`leftovers`). Pure helpers for `SplitSettings` / `LoneConsonantSettings`,
 * kept out of the component files so those export only components.
 *
 * Every helper returns a NEW scheme (the input is never mutated) in the
 * NORMALISED form `validateBlockScheme` emits (SYLLABLE_BLOCKS_PLAN.md §2,
 * pitfall N1): `split` carries `sibilantClusters` only when it is `true`, and
 * `diphthongs` / `syllabicConsonants` only when non-empty (normalised by the
 * validator's own `normalizeSoundList`), and an absent option is an absent
 * KEY, never `undefined`. Anything else would
 * make `sameDocument(draft, saved)` report a phantom unsaved change after
 * every save.
 *
 * @module writingSystem/blocks/schemeOptions
 */

import { normalizeSoundList } from '../../../../blocks';
import type { BlockLeftovers, BlockScheme, BlockSplit } from '../../../../blocks';

/** The split mode as the designer shows it; `'unset'` = no `split` stored. */
export type SplitModeChoice = BlockSplit['mode'] | 'unset';

/**
 * The normalised `split` value for a mode + the s + consonant option + the
 * vowel pairs kept together + the consonants that can carry a syllable. All
 * three options only mean something by syllable, so they are dropped in
 * template mode; `sibilantClusters` is present only when `true`, each list
 * only when its normalised form is non-empty — normalised by
 * `normalizeSoundList`, the SAME helper the validator uses (N1, P-C1). Key
 * order matches the validator's output.
 */
export function normalSplit(
    mode: BlockSplit['mode'],
    sibilantClusters: boolean,
    diphthongs: readonly string[] = [],
    syllabicConsonants: readonly string[] = [],
): BlockSplit {
    if (mode !== 'syllables') return { mode };
    const split: BlockSplit = sibilantClusters ? { mode, sibilantClusters: true } : { mode };
    const pairs = normalizeSoundList(diphthongs);
    if (pairs.length > 0) split.diphthongs = pairs;
    const consonants = normalizeSoundList(syllabicConsonants);
    if (consonants.length > 0) split.syllabicConsonants = consonants;
    return split;
}

/**
 * Store the split mode. Choosing `'templates'` explicitly stores
 * `{ mode: 'templates' }` (the owner has now decided — the "not chosen yet"
 * note goes away). See `normalSplit` for the three by-syllable options.
 */
export function withSplit(
    scheme: BlockScheme,
    mode: BlockSplit['mode'],
    sibilantClusters: boolean,
    diphthongs: readonly string[] = [],
    syllabicConsonants: readonly string[] = [],
): BlockScheme {
    return { ...scheme, split: normalSplit(mode, sibilantClusters, diphthongs, syllabicConsonants) };
}

/** Store (or, with `null`, remove) the lone-consonant mark. */
export function withLeftovers(scheme: BlockScheme, leftovers: BlockLeftovers | null): BlockScheme {
    if (leftovers === null) {
        // Rest-destructure so the key is ABSENT, not `undefined` (N1).
        const { leftovers: _dropped, ...rest } = scheme;
        return rest;
    }
    return { ...scheme, leftovers: { markGraphemeId: leftovers.markGraphemeId, placement: leftovers.placement } };
}

/** Which split mode the scheme uses, or `'unset'` when none is stored. */
export function splitModeOf(scheme: Pick<BlockScheme, 'split'>): SplitModeChoice {
    const mode = scheme.split?.mode;
    return mode === 'syllables' || mode === 'templates' ? mode : 'unset';
}
