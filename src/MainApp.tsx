import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { flex, sizing, template } from 'utils-styles';
import classNames from 'classnames';
import styles from './MainApp.module.scss';

import Background from './components/background/background.tsx';
import RouterTabContainer, { tabContainerBorderStyle } from 'cyber-components/container/tabContainer/routerTabContainer.tsx';
import IconButton from 'cyber-components/interactable/buttons/iconButton/iconButton.tsx';
import Modal from 'cyber-components/container/modal/modal.tsx';
import Button from 'cyber-components/interactable/buttons/button/button.tsx';
import { buttonStyles } from 'cyber-components/interactable/buttons/button/button.tsx';
import LexiconMain from './components/tabs/lexicon/main.tsx';
import GraphemeMain from './components/tabs/grapheme/main.tsx';
import WritingSystemMain from './components/tabs/writingSystem/main.tsx';
import TranslatorMain from './components/tabs/translator/main.tsx';
import ConlangNameModal from './components/pages/new-conlang/ConlangNameModal.tsx';
import { ExportButton, ImportButton } from './components/exportImport/ExportImportButtons.tsx';
import { useEtymolog } from './db';

const sections = [
    {
        path: 'lexicon',
        toggle: 'Lexicon',
        content: <LexiconMain />
    },
    {
        path: 'script-maker',
        toggle: 'Script Maker',
        content: <GraphemeMain />
    },
    {
        path: 'writing-system',
        toggle: 'Writing System',
        content: <WritingSystemMain />
    },
    {
        path: 'translator',
        toggle: 'Translator',
        content: <TranslatorMain />
    }
];

export default function MainApp() {
    const { api, settings } = useEtymolog();
    const navigate = useNavigate();
    const [isRenameOpen, setIsRenameOpen] = useState(false);
    const [isWipeConfirmOpen, setIsWipeConfirmOpen] = useState(false);

    const handleRename = (name: string) => {
        api.settings.update({ conlangName: name });
    };

    const handleWipe = () => {
        api.database.reset();
        api.settings.reset();
        setIsWipeConfirmOpen(false);
        navigate('/new');
    };

    return (
        <Background>
            <div
                className={classNames(
                    template.primaryOutlineContainer,
                    sizing.paddingS,
                    sizing.parentWidth,
                    flex.flexRow,
                    flex.alignItemsCenter,
                    flex.justifyContentSpaceBetween,
                )}
            >
                <div className={classNames(flex.flexRow, flex.alignItemsCenter, flex.flexGapS)}>
                    <h1 style={{ margin: 0 }}>{settings.conlangName}</h1>
                    <IconButton
                        iconName="pencil"
                        iconSize="0.8em"
                        title="Rename conlang"
                        onClick={() => setIsRenameOpen(true)}
                    />
                </div>
                <div className={classNames(flex.flexRow, flex.alignItemsCenter, flex.flexGapS)}>
                    <ExportButton />
                    <ImportButton />
                    <IconButton
                        iconName="plus-circle"
                        onClick={() => setIsWipeConfirmOpen(true)}
                        title="New Conlang"
                    >
                        New Conlang
                    </IconButton>
                </div>
            </div>

            <RouterTabContainer
                className={classNames(sizing.parentSize, flex.flexGrow)}
                basePath=""
                contentContainerProps={{
                    className: classNames(tabContainerBorderStyle, sizing.paddingLHeight)
                }}
                sections={sections}
            />

            <div className={classNames(flex.flexRow, flex.justifyContentSpaceBetween)}>
                <span>
                    Ethymolog: An open-source conlang lexicon and script management tool.
                </span>
                <span>
                    By Kerbash
                </span>
            </div>

            <ConlangNameModal
                isOpen={isRenameOpen}
                setIsOpen={setIsRenameOpen}
                initialName={settings.conlangName}
                onSubmit={handleRename}
            />

            <Modal
                isOpen={isWipeConfirmOpen}
                setIsOpen={setIsWipeConfirmOpen}
            >
                <div className={classNames(styles.modalContent, flex.flexColumn, flex.flexGapM)}>
                    <h2 style={{ margin: 0 }}>Start New Conlang?</h2>
                    <p style={{ margin: 0 }}>
                        This will permanently delete all data for <strong>{settings.conlangName}</strong> including
                        glyphs, graphemes, lexicon entries, and all settings.
                    </p>
                    <div className={classNames(flex.flexRow, flex.justifyContentEnd, flex.flexGapS)}>
                        <Button
                            className={buttonStyles.secondary}
                            onClick={() => setIsWipeConfirmOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            className={buttonStyles.primary}
                            onClick={handleWipe}
                        >
                            Delete and Start New
                        </Button>
                    </div>
                </div>
            </Modal>
        </Background>
    );
}
