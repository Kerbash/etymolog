import { useState, useCallback } from 'react';
import type { DrawingElement } from '../types';

export interface HistoryState {
    past: DrawingElement[][];
    present: DrawingElement[];
    future: DrawingElement[][];
}

export function useHistory(initialState: DrawingElement[] = []) {
    const [history, setHistory] = useState<HistoryState>({
        past: [],
        present: initialState,
        future: [],
    });

    const canUndo = history.past.length > 0;
    const canRedo = history.future.length > 0;

    const set = useCallback((newPresent: DrawingElement[], recordHistory = true) => {
        setHistory(prev => {
            if (recordHistory) {
                return {
                    past: [...prev.past, prev.present],
                    present: newPresent,
                    future: [],
                };
            }
            return {
                ...prev,
                present: newPresent,
            };
        });
    }, []);

    const undo = useCallback(() => {
        setHistory(prev => {
            if (prev.past.length === 0) return prev;

            const newPast = [...prev.past];
            const newPresent = newPast.pop()!;

            return {
                past: newPast,
                present: newPresent,
                future: [prev.present, ...prev.future],
            };
        });
    }, []);

    const redo = useCallback(() => {
        setHistory(prev => {
            if (prev.future.length === 0) return prev;

            const newFuture = [...prev.future];
            const newPresent = newFuture.shift()!;

            return {
                past: [...prev.past, prev.present],
                present: newPresent,
                future: newFuture,
            };
        });
    }, []);

    const clear = useCallback(() => {
        setHistory(prev => ({
            past: [...prev.past, prev.present],
            present: [],
            future: [],
        }));
    }, []);

    return {
        elements: history.present,
        set,
        undo,
        redo,
        clear,
        canUndo,
        canRedo,
    };
}
