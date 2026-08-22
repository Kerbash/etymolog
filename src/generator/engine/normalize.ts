/**
 * @fileoverview One spelling for one pronunciation, for comparing them.
 *
 * `ˈka.ta`, `kaːta` and `ka ta` are three transcriptions a user might type; two
 * of them are the same word. The generator has to answer "have I already made
 * this one?" thousands of times a batch, and the lexicon has to answer "is this
 * the word the URL prefilled?" — both need a form that ignores the marks that
 * punctuate a transcription without changing the sounds.
 *
 * What is stripped is exactly that punctuation. NOTHING that changes a sound is
 * touched: length marks stay (`kata` and `kaːta` are different words), tone
 * letters stay, case stays (IPA is case-sensitive — `ʙ` is not `B`), and no
 * diacritic is removed.
 *
 * @module generator/engine/normalize
 */

import { safeNormalize } from '../phonology/features';

/**
 * Marks that punctuate a transcription rather than describing a sound: primary
 * and secondary stress, the syllable dot, and the undertie that says "no break
 * here". They are all display, and a word is the same word without them.
 *
 * This is deliberately the same set `separatorKindOf` recognises. It is listed
 * again rather than derived because the two answer different questions — the
 * tokenizer needs to EMIT a separator token, this needs to DELETE it — and a
 * shared list would tempt someone to add a member for one of them.
 */
const PUNCTUATION = ['ˈ', 'ˌ', '.', '‿'];

/**
 * The comparison form of a pronunciation.
 *
 * NFC first (so a precomposed `ã` and a decomposed one compare equal), `ɡ`
 * (U+0261) folded to ASCII `g` — the single-storey g is the same letter and
 * users paste both — then punctuation and every kind of whitespace removed.
 *
 * NOT for display or storage: the string a user typed is theirs. This is a KEY.
 */
export function normalizePronunciation(input: string): string {
    if (typeof input !== 'string' || input.length === 0) return '';
    let text = safeNormalize(input, 'NFC').replace(/ɡ/g, 'g');
    for (const mark of PUNCTUATION) text = text.split(mark).join('');
    return text.replace(/\s+/g, '');
}
