/**
 * LexiconHome
 * -----------
 * The Lexicon tab's index: a `PageHeader` with the word counts and the "New
 * word" action, then the shared gallery.
 *
 * The four inline style objects that used to live here (a hand-built flex
 * header row, a `0 0.5rem` padding, a `flex: 1; min-height: 0; overflow: auto`
 * scroll box) are gone: the shell's `BasicBody` supplies the gutters and the
 * column, and the page no longer has to manage its own scrolling now that the
 * `height: 100dvh` shell is gone.
 */

import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import IconButton from 'cyber-components/interactable/buttons/iconButton/iconButton.tsx';
import { buttonStyles } from 'cyber-components/interactable/buttons/button';
import type { QuickFact } from 'cyber-components/display/quickFactsRow';

import { useEtymolog } from '../../../db';
import type { GraphemeComplete } from '../../../db/types';
import { ROUTES } from '../../../url_mapping';
import { PageHeader } from '../../shared';
import LexiconGallery from './galleryLexicon/LexiconGallery';

export default function LexiconHome() {
    const { data, isReady, error } = useEtymolog();

    // Memoised, not a bare `??`: the fallback produces a NEW empty array on
    // every render, which would change the identity of every downstream `useMemo`
    // dependency (and the gallery's `items`) on each pass.
    const lexicons = useMemo(() => data.lexiconComplete ?? [], [data.lexiconComplete]);

    const graphemeMap = useMemo(
        (): Map<number, GraphemeComplete> =>
            new Map((data.graphemesComplete ?? []).map((g) => [g.id, g] as const)),
        [data.graphemesComplete],
    );

    const needsAttention = useMemo(
        () => lexicons.filter((lexicon) => lexicon.needs_attention).length,
        [lexicons],
    );

    // "Needs attention" only appears when there IS something to attend to — a
    // permanent "0 needing attention" is noise that trains the eye to skip the
    // strip, which is exactly when the non-zero case stops being noticed.
    const facts = useMemo<QuickFact[]>(() => {
        const items: QuickFact[] = [{ label: 'Words', value: lexicons.length, big: true }];
        if (needsAttention > 0) {
            items.push({ label: 'Needs attention', value: needsAttention, big: true });
        }
        return items;
    }, [lexicons.length, needsAttention]);

    return (
        <>
            <PageHeader
                title="Lexicon"
                description="Every word in your language, with its spelling, meanings and etymology."
                facts={facts}
                actions={
                    <>
                        {/* Secondary, and second: the generator is the faster
                            way to fill an empty lexicon, but "New word" is what
                            a user who knows their word is looking for. */}
                        <IconButton
                            as={Link}
                            to={ROUTES.lexiconGenerate}
                            iconName="shuffle"
                            className={buttonStyles.secondary}
                        >
                            Generate words
                        </IconButton>
                        <IconButton
                            as={Link}
                            to={ROUTES.lexiconCreate}
                            iconName="plus-lg"
                            className={buttonStyles.primary}
                        >
                            New word
                        </IconButton>
                    </>
                }
            />

            <LexiconGallery
                lexicons={lexicons}
                graphemeMap={graphemeMap}
                isReady={isReady}
                error={error}
            />
        </>
    );
}
