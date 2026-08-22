import React, { useCallback } from 'react';
import { useProcessingLockModal } from 'cyber-components/graphics/loading/processingLockModal/processingLockModal';
import ProcessingLockModalProgressContent, {
    type ProcessingProgressHandle,
} from 'cyber-components/graphics/loading/processingLockModalProgressContent/ProcessingLockModalProgressContent';
import { useEtymolog } from '../../db';
import { downloadBlob } from 'utils-func/graphic/export';
import { exportAsJson, exportAsImage, importFromJson, importFromImage } from '../../db/exportImport';
import type { ImportReport } from '../../db/exportImport/types';
import { useNotify } from '../shared';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * One line summarising what an import actually did.
 *
 * The report has been available since Phase 1 and was dropped on the floor: the
 * modal said "Import complete!" whether it had loaded 312 words or an empty
 * file, and it never mentioned the rows validation had to prune. Both facts
 * matter — a silently smaller conlang is the kind of thing a user finds out
 * about weeks later.
 */
export function summarizeImport(report: ImportReport): string {
    const summary =
        `Imported ${plural(report.inserted.lexicon ?? 0, 'word')}, ` +
        `${plural(report.inserted.graphemes ?? 0, 'grapheme')} and ` +
        `${plural(report.inserted.glyphs ?? 0, 'glyph')}`;

    const pruned = Object.values(report.pruned).reduce((sum, n) => sum + n, 0);
    return pruned > 0
        ? `${summary}; ${plural(pruned, 'orphaned row')} dropped.`
        : `${summary}.`;
}

export function useExportImport() {
    const { settings, refresh } = useEtymolog();
    const { setContent, clearContent } = useProcessingLockModal();
    // The processing modal shows PROGRESS and disappears; the notification is
    // what survives it, so a result is still readable after the modal closes.
    const notify = useNotify();

    const handleExportJson = useCallback(() => {
        const ref = React.createRef<ProcessingProgressHandle>();
        const element = React.createElement(ProcessingLockModalProgressContent, {
            ref,
            onClose: clearContent,
        });
        setContent(element);

        setTimeout(() => {
            try {
                ref.current?.init([{ key: 'export', title: 'Exporting JSON...' }]);
                const json = exportAsJson((_, progress) => {
                    ref.current?.updateProgress({ stepIndex: -1, percent: progress });
                });
                const blob = new Blob([json], { type: 'application/json' });
                downloadBlob(blob, `${settings.conlangName}.etymolog.json`);
                ref.current?.complete(true, 'Export complete!', 2000);
            } catch (error) {
                const message = error instanceof Error ? error.message : 'An unexpected error occurred';
                ref.current?.complete(false, message);
                setContent(element, { allowManualDismiss: true });
                notify.error(message);
            }
        }, 0);
    }, [settings.conlangName, setContent, clearContent, notify]);

    const handleExportImage = useCallback(() => {
        const ref = React.createRef<ProcessingProgressHandle>();
        const element = React.createElement(ProcessingLockModalProgressContent, {
            ref,
            onClose: clearContent,
        });
        setContent(element);

        setTimeout(async () => {
            try {
                ref.current?.init([{ key: 'export', title: 'Exporting Image...' }]);
                const blob = await exportAsImage((_, progress) => {
                    ref.current?.updateProgress({ stepIndex: -1, percent: progress });
                });
                downloadBlob(blob, `${settings.conlangName}.etymolog.png`);
                ref.current?.complete(true, 'Export complete!', 2000);
            } catch (error) {
                const message = error instanceof Error ? error.message : 'An unexpected error occurred';
                ref.current?.complete(false, message);
                setContent(element, { allowManualDismiss: true });
                notify.error(message);
            }
        }, 0);
    }, [settings.conlangName, setContent, clearContent, notify]);

    const handleImportJson = useCallback((json: string, onSuccess?: () => void) => {
        const ref = React.createRef<ProcessingProgressHandle>();
        const element = React.createElement(ProcessingLockModalProgressContent, {
            ref,
            onClose: clearContent,
        });
        setContent(element);

        setTimeout(async () => {
            try {
                ref.current?.init([{ key: 'import', title: 'Importing JSON...' }]);
                const report = await importFromJson(json, (_, progress) => {
                    ref.current?.updateProgress({ stepIndex: -1, percent: progress });
                });
                refresh();
                ref.current?.complete(true, 'Import complete!', 2000);
                notify.success(summarizeImport(report));
                if (onSuccess) {
                    setTimeout(onSuccess, 2000);
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : 'An unexpected error occurred';
                ref.current?.complete(false, message);
                setContent(element, { allowManualDismiss: true });
                notify.error(message);
            }
        }, 0);
    }, [setContent, clearContent, refresh, notify]);

    const handleImportImage = useCallback((file: File, onSuccess?: () => void) => {
        const ref = React.createRef<ProcessingProgressHandle>();
        const element = React.createElement(ProcessingLockModalProgressContent, {
            ref,
            onClose: clearContent,
        });
        setContent(element);

        setTimeout(async () => {
            try {
                ref.current?.init([{ key: 'import', title: 'Importing Image...' }]);
                const report = await importFromImage(file, (_, progress) => {
                    ref.current?.updateProgress({ stepIndex: -1, percent: progress });
                });
                refresh();
                ref.current?.complete(true, 'Import complete!', 2000);
                notify.success(summarizeImport(report));
                if (onSuccess) {
                    setTimeout(onSuccess, 2000);
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : 'An unexpected error occurred';
                ref.current?.complete(false, message);
                setContent(element, { allowManualDismiss: true });
                notify.error(message);
            }
        }, 0);
    }, [setContent, clearContent, refresh, notify]);

    return {
        handleExportJson,
        handleExportImage,
        handleImportJson,
        handleImportImage,
    };
}
