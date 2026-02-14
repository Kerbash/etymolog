/**
 * Translator Home
 * ---------------
 * Main container for the phrase translation feature.
 * Allows users to input English phrases and translates them to conlang.
 */

import { useState, useEffect, useMemo } from 'react';
import type { LayoutStrategyType } from '../../display/spelling/types';
import type { PhraseTranslationResult, GraphemeComplete } from '../../../db/types';
import { useEtymolog } from '../../../db/context/EtymologContext';
import PhraseInput from './_components/PhraseInput';
import PhraseDisplay from './_components/PhraseDisplay';
import TranslationControls from './_components/TranslationControls';
import styles from './translator.module.scss';

export default function TranslatorHome() {
    const { api, data } = useEtymolog();

    // State
    const [inputPhrase, setInputPhrase] = useState('');
    const [translationResult, setTranslationResult] = useState<PhraseTranslationResult | null>(null);
    const [selectedStrategy, setSelectedStrategy] = useState<LayoutStrategyType>('block');
    const [isTranslating, setIsTranslating] = useState(false);

    // Build graphemeMap from context data for glyph resolution
    const graphemeMap = useMemo(() => {
        const map = new Map<number, GraphemeComplete>();
        for (const g of data.graphemesComplete) {
            map.set(g.id, g);
        }
        return map;
    }, [data.graphemesComplete]);

    // Debounced translation
    useEffect(() => {
        const timer = setTimeout(() => {
            if (inputPhrase.trim()) {
                setIsTranslating(true);
                const result = api.phrase.translate(inputPhrase);
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
    }, [inputPhrase, api]);

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
                <>
                    <TranslationControls
                        selectedStrategy={selectedStrategy}
                        onStrategyChange={setSelectedStrategy}
                    />

                    <PhraseDisplay
                        translationResult={translationResult}
                        strategy={selectedStrategy}
                        graphemeMap={graphemeMap}
                    />
                </>
            )}
        </div>
    );
}
