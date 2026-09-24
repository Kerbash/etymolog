/**
 * Block script — classify a spelling entry for role matching (plan §3.1).
 *
 * Pure: phonology core in, `EntryClass` out. The grapheme's sound is read with
 * the SINGLE-PHONEME api first (`describePhoneme` on the whole string — so an
 * untied `tʃ` grapheme is the affricate, as everywhere else a grapheme's
 * phoneme is read), and only when that fails is the string tokenized to decide
 * between a vowel sequence, a several-consonant sign (still a consonant), a
 * "syllable sign" and "unknown". Marks (a `mark`-category grapheme with no
 * sound, a typed `ː` / tone letter), the join `‿` and the stress marks are
 * recognised before any of that (CONLANG_EDGES_PLAN.md §3.1).
 *
 * @module blocks/classify
 */

import { classOf } from '../generator/phonology/classes';
import type { ClassLetter } from '../generator/phonology/classes';
import { describePhoneme, isAttachingMark, separatorKindOf } from '../generator/phonology/features';
import { tokenizeIpa } from '../generator/phonology/tokenize';
import type {
    BlockGraphemeIndex,
    BlockGraphemeInfo,
    BlockRole,
    BlockSpellingEntry,
    EntryClass,
} from './types';

/** The explicit block break inside a word: the IPA syllable separator. */
export const BLOCK_BOUNDARY = '.';

/**
 * The explicit block JOIN inside a word: the IPA undertie (U+203F), the
 * mirror of {@link BLOCK_BOUNDARY} — no break may fall where it sits.
 * Classified by this exact character, never by separator kind: the tokenizer
 * files `.` and `‿` under the same kind (pitfall P-A7).
 */
export const BLOCK_JOIN = '‿';

/**
 * The grapheme category of a MARK — a no-sound sign added to other signs
 * (tone, length, accent, vowel-killer). The source of truth is
 * `MARK_CATEGORY` in `db/wordSymbolService`; it is redeclared here because the
 * engine must not import the DB layer (pitfall P-A1), and a test asserts the
 * two are equal so they cannot drift.
 */
export const MARK_CATEGORY_NAME = 'mark';

/**
 * The grapheme data for an entry: the index first, then — mirroring
 * normalization's fallback — the entry's own `grapheme` when it happens to be
 * a complete grapheme (translator output carries those). `null` when neither
 * is available.
 */
export function resolveEntryGrapheme(
    entry: BlockSpellingEntry,
    index: BlockGraphemeIndex,
): BlockGraphemeInfo | null {
    if (entry.type !== 'grapheme' || !entry.grapheme) return null;
    const indexed = index.get(entry.grapheme.id);
    if (indexed) return indexed;
    const inline = entry.grapheme as Partial<BlockGraphemeInfo>;
    if (Array.isArray(inline.phonemes) && Array.isArray(inline.glyphs)) {
        return inline as BlockGraphemeInfo;
    }
    return null;
}

type SoundClass =
    | { kind: 'phoneme'; letters: ClassLetter[] }
    | { kind: 'syllable' }
    | { kind: 'empty' }
    | { kind: 'unknown' };

/** The class letters every one of `lists` has, in the first list's order. */
function commonLetters(lists: readonly ClassLetter[][]): ClassLetter[] {
    const [first, ...rest] = lists;
    return first.filter((letter) => rest.every((list) => list.includes(letter)));
}

/**
 * Classify a sound string.
 *
 *  - one describable phoneme (whole-string `describePhoneme`) → its classes;
 *  - several sounds, every one describable:
 *      all vowels     → a diphthong/vowel sequence, class `V`;
 *      all consonants → ONE consonant sign (`ng`, `ts`, `kw` typed without a
 *                       tie bar): the class letters COMMON to every member —
 *                       always `C`, so it fills a consonant slot (`ts` = P + F
 *                       keeps `C O`; `ŋm` keeps `N`);
 *      otherwise      → a syllable sign (several sounds including a vowel, `ka`);
 *  - no sounds at all (empty, only separators) → empty;
 *  - anything else → unknown.
 */
function classifySound(sound: string): SoundClass {
    const whole = describePhoneme(sound.trim());
    if (whole) return { kind: 'phoneme', letters: classOf(whole) };

    const sounds = tokenizeIpa(sound).filter((token) => token.separator === undefined);
    if (sounds.length === 0) return { kind: 'empty' };
    if (sounds.length === 1) {
        // Only reachable when the one token is unclassifiable (the whole-string
        // lookup already failed on the same text).
        const features = sounds[0].features;
        return features ? { kind: 'phoneme', letters: classOf(features) } : { kind: 'unknown' };
    }
    const described = sounds.map((token) => token.features);
    if (!described.every((features) => features !== null)) return { kind: 'unknown' };
    if (described.every((features) => features.kind === 'vowel')) return { kind: 'phoneme', letters: ['V'] };
    if (described.every((features) => features.kind === 'consonant')) {
        return { kind: 'phoneme', letters: commonLetters(described.map(classOf)) };
    }
    return { kind: 'syllable' };
}

/** The phoneme a grapheme is read as: the first auto-spelling one, else the first. */
function primaryPhoneme(grapheme: BlockGraphemeInfo): string | null {
    const preferred = grapheme.phonemes.find((p) => p.use_in_auto_spelling) ?? grapheme.phonemes[0];
    return preferred ? preferred.phoneme : null;
}

/**
 * Is this text made only of marks that attach to the sound before them
 * (`ː`, `˥˩`, a lone combining tilde)? Stress marks are separators, not
 * attaching marks, so they never pass.
 */
function isOnlyMarks(text: string): boolean {
    const points = Array.from(text);
    return points.length > 0 && points.every(isAttachingMark);
}

/**
 * Classify one spelling entry. Never throws.
 *
 * An IPA entry is read in this order (CONLANG_EDGES_PLAN.md §3.1): `.` →
 * boundary; `‿` → join; a stress mark (`ˈ ˌ`) → boundary (it cuts like `.`);
 * only attaching marks → mark; otherwise by its sound. A grapheme with no
 * phonemes is a mark when its category is `mark`, and silent (a logogram)
 * otherwise.
 */
export function classifyEntry(entry: BlockSpellingEntry, index: BlockGraphemeIndex): EntryClass {
    if (entry.role) return { kind: 'structural' };

    if (entry.type === 'ipa') {
        const char = entry.ipaCharacter;
        if (char === BLOCK_BOUNDARY) return { kind: 'boundary' };
        if (char === BLOCK_JOIN) return { kind: 'join' };
        if (!char) return { kind: 'unknown' };
        if (separatorKindOf(char) === 'stress') return { kind: 'boundary' };
        if (isOnlyMarks(char)) return { kind: 'mark', category: null };
        const sound = classifySound(char);
        if (sound.kind === 'phoneme') return { kind: 'phoneme', letters: sound.letters, category: null };
        if (sound.kind === 'syllable') return { kind: 'syllable', category: null };
        return { kind: 'unknown' };
    }

    const grapheme = resolveEntryGrapheme(entry, index);
    if (!grapheme) return { kind: 'unknown' };
    const category = grapheme.category;

    const phoneme = primaryPhoneme(grapheme);
    if (phoneme === null) {
        return category !== null && category.trim() === MARK_CATEGORY_NAME ? { kind: 'mark', category } : { kind: 'silent', category };
    }

    const sound = classifySound(phoneme);
    switch (sound.kind) {
        case 'phoneme':
            return { kind: 'phoneme', letters: sound.letters, category };
        case 'syllable':
            return { kind: 'syllable', category };
        case 'empty':
            return { kind: 'silent', category };
        case 'unknown':
            return { kind: 'unknown' };
    }
}

/**
 * Can an entry of class `cls` fill `role`? Boundaries, joins and structural
 * entries never can. A mark fills an `any` role or a role asking for its
 * category — never a class or syllable role.
 */
export function roleAccepts(role: BlockRole, cls: EntryClass): boolean {
    if (cls.kind === 'boundary' || cls.kind === 'structural' || cls.kind === 'join') return false;
    const matcher = role.matcher;
    switch (matcher.kind) {
        case 'any':
            return true;
        case 'class':
            return cls.kind === 'phoneme' && cls.letters.includes(matcher.letter);
        case 'syllable':
            return cls.kind === 'syllable';
        case 'category': {
            if (cls.kind === 'unknown') return false;
            const want = matcher.category.trim();
            return want.length > 0 && cls.category !== null && cls.category.trim() === want;
        }
    }
}

/**
 * The sound an entry is read as — the string syllabification judges sonority
 * on. A typed IPA mark returns its own character (`ː`); `syllabify` filters
 * marks out by ROLE before any sonority test, never by sound (pitfall P-A4).
 * Reads the SAME phoneme `classifyEntry` classified (an IPA entry's own
 * character; a grapheme's primary phoneme), so a unit's class and its sound can
 * never disagree about which phoneme they describe. `null` when there is none
 * (empty IPA entry, unresolvable grapheme, phoneme-less logogram). Never throws.
 */
export function entrySound(entry: BlockSpellingEntry, index: BlockGraphemeIndex): string | null {
    if (entry.type === 'ipa') return entry.ipaCharacter ? entry.ipaCharacter : null;
    const grapheme = resolveEntryGrapheme(entry, index);
    if (!grapheme) return null;
    const phoneme = primaryPhoneme(grapheme);
    return phoneme ? phoneme : null;
}
