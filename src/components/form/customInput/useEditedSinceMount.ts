/**
 * useEditedSinceMount
 * -------------------
 * "Has this piece of state been REPLACED since the component mounted?"
 *
 * Every composite input in this folder owns its rows/selection as React state
 * and announces edits to SmartForm from an effect on that state
 * (`isTouched.setIsTouched(true)`, `isChanged.setIsChanged(true)`). Such an
 * effect must not fire for the mount run, or the field is dirty before the user
 * has done anything.
 *
 * THE BUG THIS REPLACES. The guard used to be a `useRef(true)` "first run"
 * latch:
 *
 * ```ts
 * const isInitialRender = useRef(true);
 * useEffect(() => {
 *     if (isInitialRender.current) { isInitialRender.current = false; return; }
 *     …mark the field changed…
 * }, [rows]);
 * ```
 *
 * React StrictMode double-invokes every mount effect (create → destroy →
 * create) while KEEPING the component's refs, so on the second invocation the
 * latch was already `false` and the body ran — with nothing changed. `main.tsx`
 * wraps the whole app in `<StrictMode>`, so in a real browser a freshly loaded,
 * untouched create form was already dirty: `NavigationGuard` armed its
 * `beforeunload` handler and leaving the page (e.g. straight after the word
 * generator's "Edit & add") produced "Leave site?". Non-strict tests could
 * never see it, because they invoke each mount effect exactly once.
 *
 * The fix does not count effect runs at all: it compares the state value's
 * IDENTITY against the one the component mounted with. State identity changes
 * only when the setter runs — i.e. only on a real edit — so the answer is the
 * same however many times React chooses to run the effect.
 *
 * ```ts
 * const rowsEdited = useEditedSinceMount(rows);
 * useEffect(() => {
 *     if (!rowsEdited) return;
 *     …mark the field changed…
 * }, [rows, rowsEdited]);
 * ```
 *
 * @module components/form/customInput/useEditedSinceMount
 */

import { useState } from 'react';

/**
 * `false` while `value` is still the exact value captured on the first render,
 * `true` from the first time it is replaced.
 *
 * Only meaningful for values whose identity is stable between renders — i.e.
 * `useState` state, not an object literal rebuilt each render.
 *
 * The mount value is held in never-updated STATE rather than a ref: the answer
 * is consumed during render, and reading `ref.current` while rendering is both
 * a React anti-pattern and a lint error (`react-hooks/refs`). A lazy
 * initializer, so a `value` that is itself a function is stored rather than
 * called.
 */
export function useEditedSinceMount<T>(value: T): boolean {
    const [mountValue] = useState(() => value);
    return value !== mountValue;
}

export default useEditedSinceMount;
