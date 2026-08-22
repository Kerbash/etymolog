import { useCallback, useState, type ReactNode } from 'react';

import Modal from 'cyber-components/container/modal/modal';
import ConfirmationOverlay from 'cyber-components/container/modal/confirmationOverlay';
import useConfirmationDialog from 'cyber-components/container/modal/useConfirmationDialog';

import { ConfirmContext, type ConfirmFn, type ConfirmRequest } from './confirmContext';

/**
 * ConfirmDialogProvider — ONE confirmation dialog for the whole app.
 *
 * Replaces eight hand-rolled delete `<Modal>`s (each with its own inline styles,
 * its own copy, and — in six of them — a confirm button coloured with the
 * undefined `--danger` token, i.e. invisible: white text on no background) and
 * the one `window.confirm` in CustomChartsPage.
 *
 * Superseding semantics come from cyber's `useConfirmationDialog`: a second
 * `confirm()` while one is open resolves the FIRST as `false` and shows the
 * second. That is the only safe resolution — the user never saw the first
 * question, so its destructive action must not proceed.
 *
 * Mount ABOVE the routes so `/new` and the shell share one instance.
 */
export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
    const { isVisible, confirm: openDialog, onConfirm, onCancel } = useConfirmationDialog();

    // The request is NEVER cleared, only replaced by the next `confirm()`.
    //
    // That is deliberate: the modal animates out over ~300 ms, and clearing the
    // copy on cancel would blank the dialog's title and message mid-fade. Since
    // the dialog only renders while `isVisible`, a stale request is invisible —
    // and the next call overwrites it before it can be shown again.
    const [request, setRequest] = useState<ConfirmRequest | null>(null);

    // The pending request and the promise must be armed in the same call.
    // `openDialog()` owns the promise half (including settling a superseded
    // caller with `false`); this sets the copy the dialog will show.
    const confirm = useCallback<ConfirmFn>(
        (req) => {
            setRequest(req);
            return openDialog();
        },
        [openDialog],
    );

    return (
        <ConfirmContext.Provider value={confirm}>
            {children}
            <Modal
                isOpen={isVisible}
                // Backdrop click and Escape close the modal — both must resolve
                // the promise as `false`, or an `await confirm()` hangs forever.
                setIsOpen={(open) => {
                    if (!open) onCancel();
                }}
                allowClose
            >
                {request && (
                    <ConfirmationOverlay
                        frame="inline"
                        tone={request.tone ?? 'neutral'}
                        onConfirm={onConfirm}
                        onCancel={onCancel}
                        translationMap={{
                            confirmTitle: request.title,
                            confirmMessage: request.message,
                            confirmButton: request.confirmLabel ?? 'Confirm',
                            cancelButton: request.cancelLabel ?? 'Cancel',
                        }}
                    >
                        {request.extra}
                    </ConfirmationOverlay>
                )}
            </Modal>
        </ConfirmContext.Provider>
    );
}

export default ConfirmDialogProvider;
