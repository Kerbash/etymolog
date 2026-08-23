/**
 * Phrase Translation Service
 *
 * Translates English phrases into the constructed script:
 *   1. tokenize into words, punctuation marks and line breaks
 *   2. translate each word — lexicon spelling when the lemma is known,
 *      otherwise the auto-speller over the word's letters (real graphemes
 *      where a phoneme matches, virtual IPA glyphs elsewhere)
 *   3. combine with the configured separators and punctuation
 *
 * Every synthesised entry carries a `role` so the layout engine can split
 * words and lines without index bookkeeping. Translations are ephemeral.
 */

import type {
    PhraseWord,
    PhraseWordTranslation,
    PhraseTranslationResult,
    LexiconComplete,
    SpellingDisplayEntry,
    GraphemeComplete,
    Grapheme,
} from './types';
import type { PunctuationSettings, PunctuationConfig } from './api/types';
import { PUNCTUATION_KEY_BY_CHARACTER } from './api/types';
import { generateSpellingWithFallback } from './autoSpellService';

/**
 * Sentinel in the token list for an explicit line break.
 */
export const LINE_BREAK_SENTINEL = '\n';

/** Characters split off a word's edges as punctuation tokens. */
const PUNCTUATION_CHARS = new Set(Object.keys(PUNCTUATION_KEY_BY_CHARACTER));

/**
 * Split phrase into tokens: words, punctuation marks (peeled off word edges),
 * and line-break sentinels.
 */
export function tokenizePhrase(phrase: string): PhraseWord[] {
    if (!phrase || !phrase.trim()) {
        return [];
    }

    const result: PhraseWord[] = [];
    let position = 0;
    const push = (text: string, kind: PhraseWord['kind'], punctuationKey?: PhraseWord['punctuationKey']) => {
        result.push({
            originalWord: text,
            normalizedWord: text.toLowerCase().trim(),
            position: position++,
            kind,
            ...(punctuationKey ? { punctuationKey } : {}),
        });
    };
    // A straight quote opens at the start of a word and closes at its end.
    const keyFor = (mark: string, edge: 'leading' | 'trailing') =>
        mark === '"' ? (edge === 'leading' ? 'quotationOpen' : 'quotationClose') : PUNCTUATION_KEY_BY_CHARACTER[mark];

    const lines = phrase.split(/\n/);
    lines.forEach((line, lineIdx) => {
        for (const raw of line.split(/[ \t]+/).filter(w => w.length > 0)) {
            // Leading punctuation (opening quotes), the word, trailing punctuation.
            let start = 0;
            let end = raw.length;
            const leading: string[] = [];
            const trailing: string[] = [];
            while (start < end && PUNCTUATION_CHARS.has(raw[start])) leading.push(raw[start++]);
            while (end > start && PUNCTUATION_CHARS.has(raw[end - 1])) trailing.unshift(raw[--end]);
            // Collapse "..." into a single ellipsis token.
            const collapsed = (marks: string[]) => marks.join('').replace(/\.{3}/g, '…').split('');

            for (const mark of collapsed(leading)) push(mark, 'punctuation', keyFor(mark, 'leading'));
            if (end > start) push(raw.slice(start, end), 'word');
            for (const mark of collapsed(trailing)) push(mark, 'punctuation', keyFor(mark, 'trailing'));
        }
        if (lineIdx < lines.length - 1) {
            push(LINE_BREAK_SENTINEL, 'line-break');
        }
    });

    return result;
}

/** Gloss list separators: "great; large, big" offers three candidate words. */
const GLOSS_SEPARATORS = /[,;/|]/;
/** Gloss lead-ins that are not part of the word: "to run", "a cat", "the sun". */
const GLOSS_LEAD_IN = /^(?:to|a|an|the)\s+/;

/**
 * The single-word English keys a lexicon entry answers to in the translator.
 *
 * Every meaning (the `meanings` rows plus the legacy `meaning` column) is
 * split on list separators and lower-cased, then the "to …"/article lead-in,
 * any bracketed note ("run (v.)") and a trailing full stop are removed.
 * Multi-word glosses ("big house") are dropped: the translator matches one
 * token at a time, so they could never equal a token.
 */
export function meaningKeys(entry: Pick<LexiconComplete, 'meaning' | 'meanings'>): string[] {
    const glosses = [...(entry.meanings ?? []).map(m => m.meaning), entry.meaning ?? ''];
    const keys = new Set<string>();
    for (const gloss of glosses) {
        for (const part of gloss.split(GLOSS_SEPARATORS)) {
            const key = part
                .toLowerCase()
                .replace(/\([^)]*\)/g, ' ')
                .trim()
                .replace(GLOSS_LEAD_IN, '')
                .replace(/[.!?]+$/, '')
                .trim();
            if (key && !/\s/.test(key)) keys.add(key);
        }
    }
    return [...keys];
}

/**
 * Lookup a word in the lexicon (case-insensitive). First match wins.
 *
 * Meaning BEFORE lemma: the phrase is English, so "great" must find the word
 * that MEANS great before any word that happens to be romanised "great". The
 * lemma fallback keeps the other direction working — typing the conlang word
 * itself still shows its spelling.
 */
export function lookupWord(
    normalizedWord: string,
    lexiconEntries: LexiconComplete[]
): LexiconComplete | null {
    const target = normalizedWord.toLowerCase();
    return (
        lexiconEntries.find(entry => meaningKeys(entry).includes(target)) ??
        lexiconEntries.find(entry => entry.lemma.toLowerCase() === target) ??
        null
    );
}

function toGraphemeRef(grapheme: GraphemeComplete): Grapheme {
    return {
        id: grapheme.id,
        name: grapheme.name,
        category: grapheme.category,
        notes: grapheme.notes,
        created_at: grapheme.created_at,
        updated_at: grapheme.updated_at,
    };
}

/**
 * Translate a single word using the lexicon or the auto-speller.
 *
 * Auto-spelled words emit a REAL grapheme entry wherever a phoneme matched
 * (resolved through `graphemeMap`) and a virtual IPA entry for the characters
 * in between. Each entry covers the span the speller consumed, so multi-letter
 * matches no longer shift the remainder of the word.
 */
export function translateWord(
    word: PhraseWord,
    lexiconEntries: LexiconComplete[],
    graphemeMap?: Map<number, GraphemeComplete>
): PhraseWordTranslation {
    const lexiconEntry = lookupWord(word.normalizedWord, lexiconEntries);
    if (lexiconEntry) {
        return {
            word,
            type: 'lexicon',
            lexiconEntry,
            spellingDisplay: lexiconEntry.spellingDisplay,
            hasVirtualGlyphs: lexiconEntry.hasIpaFallbacks,
        };
    }

    const autoSpell = generateSpellingWithFallback(word.originalWord);
    let hasVirtualGlyphs = false;
    const spellingDisplay: SpellingDisplayEntry[] = autoSpell.spelling.map((entry, index) => {
        const segment = autoSpell.segments[index] ?? entry.ipaCharacter ?? '?';
        if (!entry.isVirtual) {
            const grapheme = graphemeMap?.get(entry.grapheme_id);
            if (grapheme) {
                return { type: 'grapheme' as const, position: index, grapheme: toGraphemeRef(grapheme) };
            }
        }
        hasVirtualGlyphs = true;
        return { type: 'ipa' as const, position: index, ipaCharacter: segment };
    });

    return { word, type: 'autospell', spellingDisplay, hasVirtualGlyphs };
}

function configuredEntry(
    fallbackCharacter: string,
    role: NonNullable<SpellingDisplayEntry['role']>,
    config?: PunctuationConfig,
    grapheme?: GraphemeComplete | null
): SpellingDisplayEntry | null {
    if (config?.useNoGlyph) {
        return null;
    }
    if (config?.graphemeId != null && grapheme) {
        return { type: 'grapheme', position: 0, grapheme: toGraphemeRef(grapheme), role };
    }
    return { type: 'ipa', position: 0, ipaCharacter: fallbackCharacter, role };
}

/**
 * The word-separator entry (a virtual space, or the configured grapheme), or
 * `null` when separators are hidden.
 */
export function createSpaceSeparator(
    config?: PunctuationConfig,
    grapheme?: GraphemeComplete | null
): SpellingDisplayEntry | null {
    return configuredEntry(' ', 'word-separator', config, grapheme);
}

/**
 * A punctuation entry for `character` (virtual, or the configured grapheme),
 * or `null` when that mark is hidden.
 */
export function createPunctuationEntry(
    character: string,
    config?: PunctuationConfig,
    grapheme?: GraphemeComplete | null
): SpellingDisplayEntry | null {
    return configuredEntry(character, 'punctuation', config, grapheme);
}

/**
 * Configuration options for phrase translation.
 */
export interface TranslationConfig {
    /** Punctuation settings from global settings */
    punctuationSettings?: PunctuationSettings;
    /** Graphemes by id — resolves configured separators/punctuation AND auto-spell matches */
    graphemeMap?: Map<number, GraphemeComplete>;
    /** @deprecated alias of `graphemeMap` */
    punctuationGraphemes?: Map<number, GraphemeComplete>;
}

/**
 * Translate an entire phrase to conlang spelling.
 */
export function translatePhrase(
    phrase: string,
    lexiconEntries: LexiconComplete[],
    config?: TranslationConfig
): PhraseTranslationResult {
    const originalPhrase = phrase;
    const normalizedPhrase = phrase.trim();
    const graphemeMap = config?.graphemeMap ?? config?.punctuationGraphemes;
    const punctuation = config?.punctuationSettings;

    const tokens = tokenizePhrase(normalizedPhrase);
    const wordTranslations: PhraseWordTranslation[] = [];
    const combinedSpelling: SpellingDisplayEntry[] = [];
    let hasVirtualGlyphs = false;
    let needsSeparator = false;

    const graphemeFor = (cfg?: PunctuationConfig) =>
        cfg?.graphemeId != null ? graphemeMap?.get(cfg.graphemeId) ?? null : null;

    const append = (entry: SpellingDisplayEntry | null) => {
        if (entry) {
            combinedSpelling.push({ ...entry, position: combinedSpelling.length });
        }
    };

    for (const token of tokens) {
        if (token.kind === 'line-break') {
            append({ type: 'ipa', position: 0, ipaCharacter: LINE_BREAK_SENTINEL, role: 'line-break' });
            needsSeparator = false;
            continue;
        }

        if (token.kind === 'punctuation') {
            const key = token.punctuationKey ?? PUNCTUATION_KEY_BY_CHARACTER[token.originalWord];
            const cfg = key ? punctuation?.[key] : undefined;
            // Opening quotes attach to the FOLLOWING word: separated from what
            // came before, glued to what comes next. Everything else attaches
            // to the preceding word.
            const opensWord = key === 'quotationOpen';
            if (opensWord && needsSeparator) {
                const sepCfg = punctuation?.wordSeparator;
                append(createSpaceSeparator(sepCfg, graphemeFor(sepCfg)));
            }
            append(createPunctuationEntry(token.originalWord, cfg, graphemeFor(cfg)));
            needsSeparator = !opensWord;
            continue;
        }

        if (needsSeparator) {
            const cfg = punctuation?.wordSeparator;
            append(createSpaceSeparator(cfg, graphemeFor(cfg)));
        }

        const translation = translateWord(token, lexiconEntries, graphemeMap);
        wordTranslations.push(translation);
        for (const entry of translation.spellingDisplay) {
            append(entry);
        }
        if (translation.hasVirtualGlyphs) {
            hasVirtualGlyphs = true;
        }
        needsSeparator = true;
    }

    return {
        originalPhrase,
        normalizedPhrase,
        wordTranslations,
        combinedSpelling,
        hasVirtualGlyphs,
        timestamp: new Date().toISOString(),
    };
}
