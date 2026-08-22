import { useCallback, useMemo, useRef, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { useConfirm } from '../../shared';
import { UnsavedChangesContext, type UnsavedChangesApi } from './unsavedChangesContext';

interface UnsavedChangesRegistryProps {
    children: ReactNode;
}

/**
 * UnsavedChangesRegistry — the in-app half of unsaved-changes protection.
 *
 * cyber `NavigationGuard` covers what leaves the DOCUMENT: reload, close, the
 * back button, and clicks on same-origin `<a>` elements. It cannot cover a
 * react-router navigation that never touches an anchor — and the primary nav is
 * exactly that: `TabContainer` calls `onSectionChange` and the shell calls
 * `navigate()`. Before this, switching tabs mid-edit discarded the form with no
 * prompt at all.
 *
 * Editors register their dirty flag here (`useRegisterUnsaved`) and every
 * in-app navigation that can strand an edit goes through `guardedNavigate`.
 * The two mechanisms are complementary, not redundant — an edit page wires up
 * BOTH.
 */
export default function UnsavedChangesRegistry({ children }: UnsavedChangesRegistryProps) {
    const confirm = useConfirm();
    const navigate = useNavigate();

    // A ref, not state: see `UnsavedChangesApi.register`.
    const dirtyKeys = useRef<Set<string>>(new Set());

    const register = useCallback((key: string, isDirty: boolean) => {
        if (isDirty) dirtyKeys.current.add(key);
        else dirtyKeys.current.delete(key);
    }, []);

    const unregister = useCallback((key: string) => {
        dirtyKeys.current.delete(key);
    }, []);

    const isDirty = useCallback(() => dirtyKeys.current.size > 0, []);

    const confirmDiscard = useCallback(async () => {
        if (dirtyKeys.current.size === 0) return true;
        return confirm({
            title: 'Leave without saving?',
            message:
                'This page has changes that have not been saved. Leaving now discards them.',
            confirmLabel: 'Discard and leave',
            cancelLabel: 'Stay on this page',
            tone: 'danger',
        });
    }, [confirm]);

    const guardedNavigate = useCallback(
        async (to: string, options?: { replace?: boolean }) => {
            if (!(await confirmDiscard())) return false;
            navigate(to, { replace: options?.replace });
            return true;
        },
        [confirmDiscard, navigate],
    );

    const api = useMemo<UnsavedChangesApi>(
        () => ({ register, unregister, isDirty, confirmDiscard, guardedNavigate }),
        [register, unregister, isDirty, confirmDiscard, guardedNavigate],
    );

    return (
        <UnsavedChangesContext.Provider value={api}>{children}</UnsavedChangesContext.Provider>
    );
}
