import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import classNames from 'classnames';
import { flex } from 'utils-styles';

import BasicHeader from 'cyber-components/layout/basic/header/header';
import IconButton from 'cyber-components/interactable/buttons/iconButton/iconButton';
import DarkmodeSwitch from 'cyber-components/interactable/settings/darkmodeSwitch';

import { useEtymolog } from '../../db';
import { useConfirm, useNotify } from '../shared';
import { ExportButton, ImportButton } from '../exportImport/ExportImportButtons';
import ConlangNameModal from '../pages/new-conlang/ConlangNameModal';
import { useUnsavedChanges } from './unsavedChanges';
import { ROUTES } from '../../url_mapping';
import styles from './AppHeader.module.scss';

/**
 * AppHeader — the app's one `<header>` landmark and the home of every action
 * that operates on the CONLANG rather than on a page: rename, export, import,
 * theme, and "start over".
 *
 * It replaces a hand-rolled `<div>` row that had no landmark, no accessible
 * names on its icon buttons, and no theme control at all (the `[data-theme]`
 * block existed in `index.css` with nothing able to set it).
 *
 * The conlang name is the document's ONLY `<h1>`; every page title below is an
 * `<h2>` (see `PageHeader.as`). That is the outline a screen-reader user
 * navigates by: "Kavi" → "Lexicon" → the page's own sections.
 */
export default function AppHeader() {
    const { api, settings } = useEtymolog();
    const navigate = useNavigate();
    const confirm = useConfirm();
    const notify = useNotify();
    const { confirmDiscard } = useUnsavedChanges();
    const [isRenameOpen, setIsRenameOpen] = useState(false);

    const handleRename = (name: string) => {
        api.settings.update({ conlangName: name });
    };

    // Renaming re-renders every page that shows the conlang name, and the modal
    // takes focus off whatever is being edited — so it asks first, through the
    // same registry the tab strip uses.
    const openRename = async () => {
        if (!(await confirmDiscard())) return;
        setIsRenameOpen(true);
    };

    // The single most destructive action in the app. It used to be a hand-rolled
    // modal whose "Delete and Start New" button was `buttonStyles.primary` — the
    // SAME visual weight as every Save button in the app. It is a danger-toned
    // confirmation now, and it names the conlang it is about to erase.
    const handleWipe = async () => {
        // Ask about unsaved edits BEFORE the wipe question: once the database is
        // reset there is nothing left to save, so a guard afterwards would be a
        // prompt about data that no longer exists.
        if (!(await confirmDiscard())) return;

        const confirmed = await confirm({
            title: `Delete "${settings.conlangName}" and start a new conlang?`,
            message:
                `This permanently deletes every glyph, grapheme, lexicon entry and setting ` +
                `for "${settings.conlangName}". It cannot be undone — export first if you ` +
                `want a copy.`,
            confirmLabel: 'Delete and start new',
            tone: 'danger',
        });
        if (!confirmed) return;

        const reset = api.database.reset();
        if (!reset.success) {
            notify.error(reset.error?.message ?? 'The conlang could not be deleted.');
            return;
        }
        api.settings.reset();
        navigate(ROUTES.new);
    };

    return (
        <BasicHeader className={styles.header}>
            <div className={styles.inner}>
                <div className={classNames(styles.titleGroup, flex.flexRow, flex.alignItemsCenter, flex.flexGapS)}>
                    <h1 className={styles.title}>{settings.conlangName}</h1>
                    <IconButton
                        iconName="pencil"
                        iconSize="0.8em"
                        aria-label="Rename conlang"
                        title="Rename conlang"
                        onClick={() => void openRename()}
                    />
                </div>

                <div className={classNames(styles.actions, flex.flexRow, flex.alignItemsCenter, flex.flexGapS)}>
                    <ExportButton />
                    <ImportButton />
                    <IconButton
                        iconName="plus-circle"
                        onClick={() => void handleWipe()}
                        aria-label="Delete this conlang and start a new one"
                        title="New conlang"
                        className={styles.newConlang}
                    >
                        <span className={styles.newConlangLabel}>New conlang</span>
                    </IconButton>
                    {/* `contentPin="bottom-end"` keeps the panel inside the
                        viewport: the switch is the last control on the right, so
                        the default alignment would open it off-screen. The
                        wording next to the icon is hidden under 480px through
                        the component's documented `[data-toggle-label]` hook. */}
                    <DarkmodeSwitch
                        themeType="basic"
                        contentPin="bottom-end"
                        className={styles.darkmode}
                        ariaLabel="Theme"
                    />
                </div>
            </div>

            <ConlangNameModal
                isOpen={isRenameOpen}
                setIsOpen={setIsRenameOpen}
                initialName={settings.conlangName}
                onSubmit={handleRename}
            />
        </BasicHeader>
    );
}
