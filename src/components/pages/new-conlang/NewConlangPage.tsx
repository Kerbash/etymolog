import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import classNames from 'classnames';
import { flex } from 'utils-styles';

import Button, { buttonStyles } from 'cyber-components/interactable/buttons/button';
import QuickFactsRow from 'cyber-components/display/quickFactsRow';

import ConlangNameModal from './ConlangNameModal.tsx';
import { ImportButton } from '../../exportImport/ExportImportButtons.tsx';
import { AppBackground } from '../../shell';
import { useEtymolog } from '../../../db';
import { ROUTES } from '../../../url_mapping';
import styles from './NewConlangPage.module.scss';

export default function NewConlangPage() {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const { api, data, settings } = useEtymolog();
    const navigate = useNavigate();

    const hasConlang = settings.conlangName.trim().length > 0;

    /**
     * Where a conlang starts.
     *
     * The old flow always landed on the Lexicon, which is the one place a brand
     * new conlang cannot do anything: a word cannot be spelled before any
     * graphemes exist, so the "New Word" call-to-action led straight into a
     * dead end (usability walk-through, "First run"). An EMPTY conlang starts in
     * Script Maker; one that already has words goes where the user expects.
     */
    const firstStop = () => (data.lexiconCount === 0 ? ROUTES.scriptMaker : ROUTES.lexicon);

    const handleNameSubmit = (name: string) => {
        api.settings.update({ conlangName: name });
        navigate(firstStop());
    };

    return (
        <AppBackground className={styles.page}>
            <div className={styles.hero}>
                <div className={styles.intro}>
                    <h1 className={styles.title}>Etymolog</h1>
                    <p className={styles.tagline}>Conlang lexicon and script management</p>
                </div>

                <div className={classNames(styles.actions, flex.flexRow, flex.flexGapM, flex.alignItemsCenter)}>
                    <Button className={buttonStyles.primary} onClick={() => setIsModalOpen(true)}>
                        New conlang
                    </Button>
                    <ImportButton onSuccess={() => navigate(firstStop())} />
                </div>

                <p className={styles.hint}>
                    A new conlang starts in <strong>Script Maker</strong>: glyphs compose into
                    graphemes, and graphemes are what words are spelled with.
                </p>

                {hasConlang && (
                    <div className={styles.loaded}>
                        <QuickFactsRow
                            items={[
                                { label: 'Currently loaded', value: settings.conlangName },
                                { label: 'Words', value: data.lexiconCount, big: true },
                                { label: 'Graphemes', value: data.graphemeCount, big: true },
                                { label: 'Glyphs', value: data.glyphCount, big: true },
                            ]}
                        />
                        <Button
                            className={buttonStyles.secondary}
                            onClick={() => navigate(firstStop())}
                        >
                            Go to {settings.conlangName}
                        </Button>
                    </div>
                )}
            </div>

            <ConlangNameModal
                isOpen={isModalOpen}
                setIsOpen={setIsModalOpen}
                onSubmit={handleNameSubmit}
            />
        </AppBackground>
    );
}
