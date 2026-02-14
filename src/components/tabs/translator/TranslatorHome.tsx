/**
 * Translator Home
 * ---------------
 * Main container for the phrase translation feature.
 * Allows users to input English phrases and translates them to conlang.
 */

import { useState, useEffect, useMemo } from 'react';
import type { PhraseTranslationResult, GraphemeComplete } from '../../../db/types';
import { useEtymolog } from '../../../db/context/EtymologContext';
import PhraseInput from './_components/PhraseInput';
import PhraseDisplay from './_components/PhraseDisplay';
import styles from './translator.module.scss';

export default function TranslatorHome() {
    const { api, data, settings } = useEtymolog();

    // State
    const [inputPhrase, setInputPhrase] = useState('');
    const [translationResult, setTranslationResult] = useState<PhraseTranslationResult | null>(null);
    const [isTranslating, setIsTranslating] = useState(false);

    // Build graphemeMap from context data for glyph resolution
    const graphemeMap = useMemo(() => {
        const map = new Map<number, GraphemeComplete>();
        for (const g of data.graphemesComplete) {
            map.set(g.id, g);
        }
        return map;
    }, [data.graphemesComplete]);

    // Compute word and line-break boundary indices by scanning combinedSpelling directly.
    // Word boundaries = indices of space separator entries.
    // Line break boundaries = indices of '\n' entries.
    const { wordBoundaries, lineBreaks } = useMemo(() => {
        if (!translationResult) return { wordBoundaries: undefined, lineBreaks: undefined };

        const wordBounds: number[] = [];
        const lineBounds: number[] = [];

        for (let i = 0; i < translationResult.combinedSpelling.length; i++) {
            const entry = translationResult.combinedSpelling[i];
            if (entry.type === 'ipa' && entry.ipaCharacter === '\n') {
                lineBounds.push(i);
            } else if (entry.type === 'ipa' && entry.ipaCharacter === ' ') {
                wordBounds.push(i);
            }
        }

        return {
            wordBoundaries: wordBounds.length > 0 ? wordBounds : undefined,
            lineBreaks: lineBounds.length > 0 ? lineBounds : undefined,
        };
    }, [translationResult]);

    // Debounced translation
    useEffect(() => {
        const timer = setTimeout(() => {
            if (inputPhrase.trim()) {
                setIsTranslating(true);
                // Pass punctuation settings to the translate API
                const result = api.phrase.translate(inputPhrase, settings.punctuation);
                if (result.success && result.data) {
                    setTranslationResult(result.data);
                } else {
                    console.error('Translation failed:', result.error);
                    setTranslationResult(null);
                }
                setIsTranslating(false);
            } else {
                setTranslationResult(null);
            }
        }, 300); // 300ms debounce

        return () => clearTimeout(timer);
    }, [inputPhrase, api, settings.punctuation]);

    // === DEBUG: Log everything fed into the translator ===
    if (translationResult) {
        console.group('[TranslatorHome DEBUG]');
        console.log('writingSystem settings:', settings.writingSystem);
        console.log('wordBoundaries:', wordBoundaries);
        console.log('wordTranslations count:', translationResult.wordTranslations.length);
        console.log('combinedSpelling length:', translationResult.combinedSpelling.length);
        console.log('combinedSpelling entries:',
            translationResult.combinedSpelling.map((entry, i) => ({
                index: i,
                type: entry.type,
                ipa: entry.ipaCharacter ?? null,
                graphemeName: entry.grapheme?.name ?? null,
                position: entry.position,
                isBoundary: wordBoundaries?.includes(i) ? '<<< BOUNDARY' : '',
            }))
        );
        console.log('wordTranslations detail:',
            translationResult.wordTranslations.map((wt, i) => ({
                wordIndex: i,
                word: wt.word,
                type: wt.type,
                spellingLength: wt.spellingDisplay.length,
                spellingEntries: wt.spellingDisplay.map(e => e.ipaCharacter ?? e.grapheme?.name ?? '?'),
            }))
        );
        console.groupEnd();
    }
    // === END DEBUG ===

    return (
        <div className={styles.container}>
            <h2 className={styles.heading}>Phrase Translator</h2>
            <p className={styles.description}>
                Translate English phrases to your constructed language. Words found in the lexicon will use their
                defined spelling, while unknown words will be spelled character-by-character.
            </p>

            <PhraseInput
                value={inputPhrase}
                onChange={setInputPhrase}
            />

            {isTranslating && <div className={styles.loading}>Translating...</div>}

            {translationResult && !isTranslating && (
                <PhraseDisplay
                    translationResult={translationResult}
                    strategy="block"
                    graphemeMap={graphemeMap}
                    writingSystem={settings.writingSystem}
                    wordBoundaries={wordBoundaries}
                    lineBreaks={lineBreaks}
                />
            )}
        </div>
    );
}
