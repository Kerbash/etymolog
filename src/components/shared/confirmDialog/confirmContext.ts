import { createContext, useContext, type ReactNode } from 'react';

export interface ConfirmRequest {
    /**
     * The question. ALWAYS name the entity — `Delete glyph "ka"?`, never
     * `Are you sure?`. A nameless confirmation is the single most common cause
     * of a user approving the wrong deletion, and this app had six of them.
     */
    title: string;
    /** What will happen, and whether it can be undone. */
    message: string;
    /** Confirm button label. Default `'Confirm'`; prefer a verb — "Delete word". */
    confirmLabel?: string;
    /** Cancel button label. Default `'Cancel'`. */
    cancelLabel?: string;
    /**
     * `'danger'` for anything irreversible (delete, wipe, replace-on-import):
     * red confirm button with a trash icon. Default `'neutral'`.
     */
    tone?: 'neutral' | 'danger';
    /**
     * Extra content between the message and the buttons — an "also respell the
     * lexicon" checkbox, a list of the words that will break. Keep it light; a
     * confirmation with a whole form in it wants its own modal.
     */
    extra?: ReactNode;
}

export type ConfirmFn = (request: ConfirmRequest) => Promise<boolean>;

/**
 * The context and its hook live in a separate module from the provider
 * COMPONENT on purpose: a `.tsx` file that exports both a component and a hook
 * defeats react-refresh (the whole module remounts on every edit, dropping the
 * state the provider exists to hold) — which is what `react-refresh/
 * only-export-components` is warning about.
 */
export const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * `const confirm = useConfirm();` → `await confirm({ title, message, tone })`.
 *
 * Resolves `true` only when the user pressed the confirm button. Cancel,
 * Escape, backdrop click, unmount and being superseded by a later `confirm()`
 * all resolve `false`, so the caller's `if (!ok) return;` guard is sufficient
 * and no path leaves the promise pending.
 *
 * Throws outside the provider rather than returning a no-op: a no-op would
 * delete without asking, which is the exact failure the dialog exists to
 * prevent.
 */
export function useConfirm(): ConfirmFn {
    const ctx = useContext(ConfirmContext);
    if (!ctx) {
        throw new Error('useConfirm must be used inside a <ConfirmDialogProvider>');
    }
    return ctx;
}
