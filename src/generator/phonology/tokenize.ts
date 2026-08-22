/**
 * @fileoverview IPA string to phoneme tokens.
 *
 * A pronunciation is not a sequence of characters. `t͡ʃ` is three code points
 * and one sound; `aː` is two and one; `ã` may arrive as one code point or two
 * depending on where it was copied from. Anything that walks a pronunciation —
 * the generator's constraints, the spelling preview, the chart guide — has to
 * walk SOUNDS, so it walks this.
 *
 * The tokenizer never throws. It is fed grapheme rows, pasted transcriptions and
 * half-typed input; an exception on the render path of a page that is showing
 * the user their own data would be a far worse failure than a token nobody can
 * classify, which is exactly what `features: null` is for.
 *
 * @module generator/phonology/tokenize
 */

import {
    describePhoneme,
    isAttachingMark,
    isTieBar,
    safeNormalize,
    separatorKindOf,
} from './features';
import type { IpaSeparator, PhonemeFeatures } from './features';

/**
 * One sound, or one structural mark, out of a transcription.
 *
 * `index` is the start offset of `text` inside the NFC-normalised input, not the
 * token's position in the array — the array already gives that, and an offset is
 * what a caller needs to point at the source string (an error marker, a
 * highlight).
 */
export interface IpaToken {
    /**
     * The source substring, unchanged. `ɡ` (U+0261) stays `ɡ` here even though
     * its `features.base` is the canonical `g`: the string a user typed is
     * theirs, and only the classification is normalised.
     */
    text: string;
    /** Start offset within the NFC-normalised input. */
    index: number;
    /** `null` for separators and for anything the feature table cannot resolve. */
    features: PhonemeFeatures | null;
    /** Present only on structural marks; a sound token never has it. */
    separator?: IpaSeparator;
}

/**
 * Split a transcription into tokens.
 *
 * A token is one base symbol plus everything that rides on it: combining marks,
 * modifier letters, and — because a tie bar means "these two symbols are one
 * sound" — the base a tie bar points at. `ˈ ˌ . ‿` and whitespace come back as
 * separator tokens so that a caller can rebuild the exact input by joining
 * `text` (against the NFC form of it: normalisation is the one change made, and
 * it is what makes a precomposed `ã` and a decomposed one behave alike).
 *
 * WHY `tʃ` IS TWO TOKENS HERE. Without a tie bar, `tʃ` is genuinely ambiguous:
 * in `katʃa` it is far more likely to be an affricate, in `hotʃop` it might be a
 * cluster across a syllable boundary — and a tokenizer sees neither the word nor
 * the language's inventory. So the tokenizer takes the conservative reading (two
 * sounds) and `describePhoneme` takes the other one. That is not an
 * inconsistency: `describePhoneme` is the SINGLE-PHONEME api, called where the
 * caller already knows the whole string is meant as one sound (an inventory
 * entry, a preset sound, a grapheme's phoneme). Tie-barred `t͡ʃ` is unambiguous
 * and is one token in both.
 */
export function tokenizeIpa(input: string): IpaToken[] {
    const tokens: IpaToken[] = [];
    if (typeof input !== 'string' || input.length === 0) return tokens;

    const text = safeNormalize(input, 'NFC');
    const points = Array.from(text);

    // Code-unit offset of every code point, so `index` can address the string
    // the caller holds. Never `split('')`: it would cut every astral symbol and
    // every tie bar loose from what it belongs to.
    const offsets: number[] = [];
    let offset = 0;
    for (const point of points) {
        offsets.push(offset);
        offset += point.length;
    }

    let i = 0;
    while (i < points.length) {
        const start = i;
        const separator = separatorKindOf(points[i]);
        if (separator !== null) {
            tokens.push({ text: points[i], index: offsets[start], features: null, separator });
            i += 1;
            continue;
        }

        // The base. Anything at all can be one — an unknown letter still starts
        // a token, it just cannot be classified.
        i += 1;

        while (i < points.length) {
            const next = points[i];
            if (isTieBar(next)) {
                // A tie bar swallows the symbol after it — the next BASE, so a
                // doubled bar (`t͡͡ʃ`, a slip of the keyboard or a bad paste) is
                // stepped over rather than being taken as the symbol itself.
                // Consuming only one bar left the second one standing in for
                // the base and split the affricate in two.
                let scan = i;
                while (scan < points.length && isTieBar(points[scan])) scan += 1;
                const joined = points[scan];
                // If there is nothing after the run, or a separator, the bars
                // are dangling: keep them on this token rather than emitting a
                // token that is only a mark.
                i = joined !== undefined && separatorKindOf(joined) === null ? scan + 1 : scan;
                continue;
            }
            if (isAttachingMark(next)) {
                i += 1;
                continue;
            }
            break;
        }

        const raw = points.slice(start, i).join('');
        tokens.push({ text: raw, index: offsets[start], features: describePhoneme(raw) });
    }

    return tokens;
}

/**
 * The sounds of a string, with the structural marks dropped.
 *
 * This is the shape an inventory entry, a preset sound list or a template's
 * literal group is in: a bare sequence of phonemes where stress and syllable
 * dots would be noise. Tokens are returned rather than strings because callers
 * that only want the text can map `.text`, while callers that want the features
 * would otherwise have to classify all over again.
 */
export function splitPhonemeString(input: string): IpaToken[] {
    return tokenizeIpa(input).filter((token) => token.separator === undefined);
}
