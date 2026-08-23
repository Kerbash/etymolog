/**
 * Translator Home
 * ---------------
 * Type an English phrase, see it in your script.
 *
 * Every state the page can be in now has a surface: nothing typed yet
 * (`EmptyState`), a translation in flight (`LoadingState variant="inline"`), a
 * failure (an app toast, which is what the rest of the app does), and a result.
 * The page used to render the bare string "Translating..." and put its errors in
 * a `div role="alert"` that no other failure in the app used.
 */

import { useEffect, useMemo, useState } from 'react';

import EmptyState from 'cyber-components/display/emptyState';

import { useEtymolog } from '../../../db/context/etymologContext';
import type { GraphemeComplete, PhraseTranslationResult } from '../../../db/types';
import type { LayoutStrategyType } from '../../display/spelling/types';
import { LoadingState, PageHeader, useNotify } from '../../shared';
import PhraseDisplay from './_components/PhraseDisplay';
import PhraseInput from './_components/PhraseInput';
import TranslationControls from './_components/TranslationControls';

import styles from './translator.module.scss';

export default function TranslatorHome() {
    const { api, data, settings } = useEtymolog();
    const notify = useNotify();

    const [inputPhrase, setInputPhrase] = useState('');
    const [strategy, setStrategy] = useState<LayoutStrategyType>('block');
    const [translationResult, setTranslationResult] = useState<PhraseTranslationResult | null>(
        null,
    );
    const [isTranslating, setIsTranslating] = useState(false);

    const graphemeMap = useMemo(() => {
        const map = new Map<number, GraphemeComplete>();
        for (const grapheme of data.graphemesComplete) map.set(grapheme.id, grapheme);
        return map;
    }, [data.graphemesComplete]);

    // Debounced translation. `notify` is deliberately NOT a dependency: it is
    // stable from the provider, and listing it here would re-run the effect (and
    // re-translate) on every notification the app shows.
    useEffect(() => {
        if (!inputPhrase.trim()) {
            setTranslationResult(null);
            setIsTranslating(false);
            return;
        }

        setIsTranslating(true);

        const timer = setTimeout(() => {
            const result = api.phrase.translate(inputPhrase, settings.punctuation);
            if (result.success && result.data) {
                setTranslationResult(result.data);
            } else {
                setTranslationResult(null);
                notify.error(result.error?.message ?? 'The phrase could not be translated.', {
                    title: 'Translation failed',
                });
            }
            setIsTranslating(false);
        }, 300);

        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inputPhrase, api, settings.punctuation]);

    const hasInput = inputPhrase.trim().length > 0;

    return (
        <div className={styles.container}>
            <PageHeader
                title="Phrase translator"
                description="Words whose meaning (or lemma) is in the lexicon use their defined spelling; unknown words are spelled character by character."
            />

            <PhraseInput value={inputPhrase} onChange={setInputPhrase} />

            <TranslationControls selectedStrategy={strategy} onStrategyChange={setStrategy} />

            {!hasInput && (
                <EmptyState
                    icon="translate"
                    title="Type a phrase to see it in your script"
                    description="Anything you type above is laid out with the strategy you picked, using your graphemes."
                />
            )}

            {hasInput && isTranslating && (
                <LoadingState variant="inline" label="Translating the phrase" />
            )}

            {hasInput && !isTranslating && translationResult && (
                <PhraseDisplay
                    translationResult={translationResult}
                    strategy={strategy}
                    graphemeMap={graphemeMap}
                    writingSystem={settings.writingSystem}
                />
            )}
        </div>
    );
}
