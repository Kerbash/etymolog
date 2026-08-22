/**
 * UnsavedChanges — context, hooks and types.
 *
 * Split out of `UnsavedChangesRegistry.tsx` so that file exports a COMPONENT
 * and nothing else (`react-refresh/only-export-components`; mixing hooks and a
 * provider in one module makes Fast Refresh remount the provider and drop every
 * registration on an unrelated edit).
 */

import { createContext, useContext, useEffect, useId } from 'react';

export interface UnsavedChangesApi {
    /**
     * Declare whether `key`'s editor currently holds unsaved input. Calling it
     * with `false` (or `unregister`) clears the key — the registry is "the set
     * of dirty editors", so a saved form leaves no trace behind.
     *
     * Deliberately does NOT trigger a re-render: the registry is read at
     * navigation time, never rendered, and a keystroke-rate state update in a
     * provider that wraps the whole app is a measurable cost for no benefit.
     */
    register(key: string, isDirty: boolean): void;
    /** Drop `key` entirely — call on unmount. */
    unregister(key: string): void;
    /** True when ANY registered editor is dirty. */
    isDirty(): boolean;
    /**
     * Ask the user whether to discard. Resolves `true` when it is safe to
     * proceed — including the common case of nothing being dirty, where no
     * dialog is shown at all.
     */
    confirmDiscard(): Promise<boolean>;
    /**
     * `confirmDiscard()` followed by `navigate(to)`. Returns whether the
     * navigation happened, so a caller that also has local state to reset can
     * tell the difference between "left" and "stayed".
     */
    guardedNavigate(to: string, options?: { replace?: boolean }): Promise<boolean>;
}

export const UnsavedChangesContext = createContext<UnsavedChangesApi | null>(null);

export function useUnsavedChanges(): UnsavedChangesApi {
    const ctx = useContext(UnsavedChangesContext);
    if (!ctx) {
        throw new Error('useUnsavedChanges must be used inside an <UnsavedChangesRegistry>');
    }
    return ctx;
}

/**
 * Register an editor's dirty flag for the lifetime of the component.
 *
 * ```tsx
 * useRegisterUnsaved('lexicon-editor', formState.isChanged && !formState.isSubmitting);
 * ```
 *
 * `key` is for the developer reading the registry, not for identity: the entry
 * is namespaced with a per-INSTANCE `useId()`. Two hazards go away with it —
 * two editors of the same kind open at once, and (the one that actually bit) a
 * REMOUNT of the same component, where React mounts the new instance before
 * running the old one's cleanup, so a shared key would be registered by the new
 * copy and then immediately unregistered by the old one. Unmounting always
 * unregisters, so a form that navigates away after a successful save cannot
 * leave a stale "dirty" behind.
 */
export function useRegisterUnsaved(key: string, isDirty: boolean): void {
    const { register, unregister } = useUnsavedChanges();
    const instanceKey = `${key}#${useId()}`;

    useEffect(() => {
        register(instanceKey, isDirty);
    }, [register, instanceKey, isDirty]);

    // Separate effect: the cleanup must run on UNMOUNT (and on a key change),
    // not on every `isDirty` flip — sharing the effect above would unregister
    // and re-register on each keystroke, which is correct but pointless churn,
    // and would clear the flag for one render if the two ever interleaved.
    useEffect(() => () => unregister(instanceKey), [unregister, instanceKey]);
}
