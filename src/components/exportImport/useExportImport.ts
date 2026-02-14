import React, { useCallback } from 'react';
import { useProcessingLockModal } from 'cyber-components/graphics/loading/processingLockModal/processingLockModal';
import ProcessingLockModalProgressContent, {
    type ProcessingProgressHandle,
} from 'cyber-components/graphics/loading/processingLockModalProgressContent/ProcessingLockModalProgressContent';
import { useEtymolog } from '../../db';
import { downloadBlob } from 'utils-func/graphic/export';
import { exportAsJson, exportAsImage, importFromJson, importFromImage } from '../../db/exportImport';

export function useExportImport() {
    const { settings, refresh } = useEtymolog();
    const { setContent, clearContent } = useProcessingLockModal();

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
            } catch (error: any) {
                ref.current?.complete(false, error.message);
            }
        }, 0);
    }, [settings.conlangName, setContent, clearContent]);

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
            } catch (error: any) {
                ref.current?.complete(false, error.message);
            }
        }, 0);
    }, [settings.conlangName, setContent, clearContent]);

    const handleImportJson = useCallback((json: string, onSuccess?: () => void) => {
        const ref = React.createRef<ProcessingProgressHandle>();
        const element = React.createElement(ProcessingLockModalProgressContent, {
            ref,
            onClose: clearContent,
        });
        setContent(element);

        setTimeout(() => {
            try {
                ref.current?.init([{ key: 'import', title: 'Importing JSON...' }]);
                importFromJson(json, (_, progress) => {
                    ref.current?.updateProgress({ stepIndex: -1, percent: progress });
                });
                refresh();
                ref.current?.complete(true, 'Import complete!', 2000);
                if (onSuccess) {
                    setTimeout(onSuccess, 2000);
                }
            } catch (error: any) {
                ref.current?.complete(false, error.message);
            }
        }, 0);
    }, [setContent, clearContent, refresh]);

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
                await importFromImage(file, (_, progress) => {
                    ref.current?.updateProgress({ stepIndex: -1, percent: progress });
                });
                refresh();
                ref.current?.complete(true, 'Import complete!', 2000);
                if (onSuccess) {
                    setTimeout(onSuccess, 2000);
                }
            } catch (error: any) {
                ref.current?.complete(false, error.message);
            }
        }, 0);
    }, [setContent, clearContent, refresh]);

    return {
        handleExportJson,
        handleExportImage,
        handleImportJson,
        handleImportImage,
    };
}
