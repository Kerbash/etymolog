/**
 * PunctuationPage — `/script-maker/punctuation`.
 *
 * How each punctuation mark and separator is written: a grapheme of your own, a
 * virtual glyph (the original character in a dashed box), or nothing at all.
 *
 * Two things changed with the move onto {@link ChartPageLayout}:
 *
 *  - **saves say so.** Every control here writes settings immediately, and did
 *    it in total silence — there was no way to tell a save from a no-op, and a
 *    REJECTED save (settings validation is strict, and rejects the WHOLE update
 *    on one bad value) was invisible. Every write goes through `useApiAction`
 *    now, which reports both outcomes.
 *  - the grapheme picker is the shared gallery in selection mode, unchanged —
 *    it was already the pattern `GlyphPickerModal` copied.
 */

import { useCallback, useMemo, useState } from 'react';

import Modal from 'cyber-components/container/modal/modal';

import { useEtymolog } from '../../../../db';
import type { GraphemeComplete } from '../../../../db/types';
import type { PunctuationKey } from '../../../../data/punctuationData';
import { ROUTES } from '../../../../url_mapping';
import { PunctuationTable } from '../../../display/punctuationChart';
import { DialogPanel, useApiAction } from '../../../shared';
import ChartPageLayout from '../chartPage/ChartPageLayout';
import GraphemeGallery from '../galleryGrapheme/graphemeGallery';

import styles from './PunctuationPage.module.scss';

export default function PunctuationPage() {
    const { api, data, settings, isReady, error } = useEtymolog();
    const runApiAction = useApiAction();

    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const [pendingKey, setPendingKey] = useState<PunctuationKey | null>(null);

    const punctuation = settings.punctuation;
    const graphemes = data.graphemesComplete;

    /** punctuation key → the grapheme assigned to it, when it still exists. */
    const punctuationGraphemeMap = useMemo(() => {
        const map = new Map<PunctuationKey, GraphemeComplete>();
        if (!punctuation) return map;

        const byId = new Map<number, GraphemeComplete>();
        for (const grapheme of graphemes ?? []) byId.set(grapheme.id, grapheme);

        for (const [key, config] of Object.entries(punctuation)) {
            if (config.graphemeId == null) continue;
            const grapheme = byId.get(config.graphemeId);
            if (grapheme) map.set(key as PunctuationKey, grapheme);
        }
        return map;
    }, [punctuation, graphemes]);

    /**
     * `api.settings.update` is STRICT — an unknown key or a bad enum value
     * rejects the whole update — so the current `punctuation` object is spread
     * whole rather than the one changed entry sent on its own.
     */
    const savePunctuation = useCallback(
        (key: PunctuationKey, config: { graphemeId: number | null; useNoGlyph: boolean }) =>
            runApiAction(
                () =>
                    api.settings.update({
                        punctuation: { ...punctuation, [key]: config },
                    }),
                { errorTitle: 'Could not save the punctuation setting', success: 'Punctuation saved.' },
            ),
        [api, punctuation, runApiAction],
    );

    const handleAssign = useCallback((key: PunctuationKey) => {
        setPendingKey(key);
        setIsPickerOpen(true);
    }, []);

    const handleGraphemeSelect = useCallback(
        (grapheme: GraphemeComplete) => {
            if (!pendingKey) return;
            const key = pendingKey;
            setIsPickerOpen(false);
            setPendingKey(null);
            // Assigning a grapheme un-hides the mark: the two states are
            // mutually exclusive, and leaving `useNoGlyph` set would store an
            // assignment that never renders.
            void savePunctuation(key, { graphemeId: grapheme.id, useNoGlyph: false });
        },
        [pendingKey, savePunctuation],
    );

    const handleToggleNoGlyph = useCallback(
        (key: PunctuationKey, useNoGlyph: boolean) => {
            void savePunctuation(key, {
                graphemeId: punctuation[key]?.graphemeId ?? null,
                useNoGlyph,
            });
        },
        [punctuation, savePunctuation],
    );

    const handleClear = useCallback(
        (key: PunctuationKey) => {
            void savePunctuation(key, { graphemeId: null, useNoGlyph: false });
        },
        [savePunctuation],
    );

    const hiddenCount = useMemo(
        () => Object.values(punctuation ?? {}).filter((config) => config.useNoGlyph).length,
        [punctuation],
    );

    return (
        <ChartPageLayout
            title="Punctuation & separators"
            description="Choose how each mark is written: a grapheme of your own, a virtual glyph, or nothing at all."
            back={{ to: ROUTES.scriptMaker, label: 'Graphemes' }}
            facts={[
                { label: 'Marks assigned', value: punctuationGraphemeMap.size, big: true },
                { label: 'Hidden', value: hiddenCount, big: true },
            ]}
            isReady={isReady}
            error={error ?? null}
            aboutLabel="About these settings"
            about={
                <>
                    <h4>What the three states mean</h4>
                    <ul>
                        <li>
                            <strong>Assigned</strong> — written with a grapheme you created for it.
                        </li>
                        <li>
                            <strong>Virtual</strong> — the original character in a dashed box. This
                            is the default for a new language.
                        </li>
                        <li>
                            <strong>Hidden</strong> — not written at all. Use it for scripts that do
                            not separate words or sentences visually.
                        </li>
                    </ul>
                    <p>
                        The <strong>word</strong> and <strong>sentence separators</strong> at the top
                        matter most: they decide how words and sentences are told apart on the page.
                    </p>
                </>
            }
        >
            <div className={styles.tableArea}>
                <div className={styles.separatorNote}>
                    <h3>Word &amp; sentence separators</h3>
                    <p>
                        These two control how words and sentences are visually distinguished. Use
                        the eye button to hide them if your script does not separate them.
                    </p>
                </div>

                <PunctuationTable
                    graphemeMap={punctuationGraphemeMap}
                    settings={punctuation}
                    onAssign={handleAssign}
                    onToggleNoGlyph={handleToggleNoGlyph}
                    onClear={handleClear}
                />
            </div>

            <Modal isOpen={isPickerOpen} setIsOpen={setIsPickerOpen} allowClose>
                <DialogPanel size="lg" title="Select a grapheme for this mark">
                    <p className={styles.modalDescription}>
                        The grapheme you pick is written in place of the original character.
                    </p>
                    <div className={styles.galleryContainer}>
                        <GraphemeGallery selectionMode onSelect={handleGraphemeSelect} />
                    </div>
                </DialogPanel>
            </Modal>
        </ChartPageLayout>
    );
}
