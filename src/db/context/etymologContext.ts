/**
 * Etymolog Context — object, types and hooks
 *
 * Split out of `EtymologContext.tsx` so that file exports ONLY the
 * `EtymologProvider` component. React Fast Refresh can only preserve state for
 * a module whose exports are all components; mixing the context object and the
 * five consumer hooks into the same file silently disabled HMR for the whole
 * provider subtree (and tripped `react-refresh/only-export-components`).
 *
 * Nothing here renders — it is the contract the provider fills in.
 */

import { createContext, useContext, useCallback } from 'react';

import type { EtymologApi, EtymologSettings } from '../api';
import type { DatabaseHealth } from '../database';
import type { PersistenceState } from '../persistence';

import type {
    Glyph,
    GlyphWithUsage,
    GraphemeComplete,
    LexiconComplete,
} from '../types';

// =============================================================================
// CONTEXT TYPES
// =============================================================================

export interface RefreshError {
    /** Which slice failed to load */
    slice: 'glyphs' | 'graphemes' | 'lexicon';
    message: string;
    at: string;
}

/**
 * Reactive data state managed by the context.
 */
export interface EtymologData {
    /** All glyphs */
    glyphs: Glyph[];
    /** All glyphs with usage count */
    glyphsWithUsage: GlyphWithUsage[];
    /** All graphemes with complete data (glyphs + phonemes) */
    graphemesComplete: GraphemeComplete[];
    /** All lexicon entries with complete data */
    lexiconComplete: LexiconComplete[];
    glyphCount: number;
    graphemeCount: number;
    lexiconCount: number;
    /** The most recent refresh that failed, or null. Cleared when that slice next loads. */
    lastRefreshError: RefreshError | null;
}

/**
 * Context value exposed to consumers.
 */
export interface EtymologContextValue {
    /** The unified API for all operations (mutations auto-refresh the affected data) */
    api: EtymologApi;
    /** Reactive data state */
    data: EtymologData;
    /** Current settings */
    settings: EtymologSettings;
    /** Durable-storage status (saved / saving / error) */
    persistence: PersistenceState;
    /** What database boot found (recovery used, FK violations, migration applied) */
    health: DatabaseHealth;
    /** Whether the database is initializing */
    isLoading: boolean;
    /** Whether the database is ready for operations */
    isReady: boolean;
    /** Error during initialization, if any */
    error: Error | null;
    /** Refresh all data from the database */
    refresh: () => void;
    refreshGlyphs: () => void;
    refreshGraphemes: () => void;
    refreshLexicon: () => void;
    /**
     * Run `fn` with the per-mutation refreshes COALESCED into one per slice.
     *
     * Every mutation on `api` refreshes the slices it can have changed, which
     * is right for one call and quadratic for a loop: adding 100 generated
     * words re-read the entire lexicon 100 times, once per `lexicon.create`,
     * because each create is its own synchronous SQLite transaction and each
     * one triggered its own `getAllComplete()`. Inside a batch the slices are
     * only RECORDED; the outermost `batchMutations` refreshes each recorded
     * slice exactly once, on the way out.
     *
     * Contract:
     *  - re-entrant — nested batches join the outer one and refresh once in
     *    total, so a helper that batches internally is safe to call from a loop
     *    that also batches;
     *  - only slices whose mutation actually SUCCEEDED are refreshed, exactly
     *    as outside a batch;
     *  - if `fn` throws, the pending refreshes still run (so the successful
     *    part of a half-finished loop is on screen) and the error is rethrown;
     *  - `fn`'s return value is passed straight through.
     *
     * It is NOT a transaction: nothing is rolled back. It batches READS.
     */
    batchMutations: <T>(fn: () => T) => T;
}

/** The state a provider starts from, and what every failed load falls back to. */
export const EMPTY_DATA: EtymologData = {
    glyphs: [],
    glyphsWithUsage: [],
    graphemesComplete: [],
    lexiconComplete: [],
    glyphCount: 0,
    graphemeCount: 0,
    lexiconCount: 0,
    lastRefreshError: null,
};

// =============================================================================
// CONTEXT CREATION
// =============================================================================

export const EtymologContext = createContext<EtymologContextValue | null>(null);

// =============================================================================
// HOOKS
// =============================================================================

/**
 * Main hook for accessing the Etymolog context (API, data, settings, state).
 */
export function useEtymolog(): EtymologContextValue {
    const context = useContext(EtymologContext);
    if (!context) {
        throw new Error('useEtymolog must be used within an EtymologProvider');
    }
    return context;
}

/** Convenience hook for accessing only the API. */
export function useEtymologApi(): EtymologApi {
    const { api } = useEtymolog();
    return api;
}

/** Convenience hook for accessing only the reactive data. */
export function useEtymologData(): EtymologData {
    const { data } = useEtymolog();
    return data;
}

/** Convenience hook for accessing and updating settings. */
export function useEtymologSettings() {
    const { settings, api } = useEtymolog();

    const updateSettings = useCallback((updates: Partial<EtymologSettings>) => {
        return api.settings.update(updates);
    }, [api]);

    const resetSettings = useCallback(() => {
        return api.settings.reset();
    }, [api]);

    return { settings, updateSettings, resetSettings };
}

/** Convenience hook for accessing loading/ready state. */
export function useEtymologStatus() {
    const { isLoading, isReady, error } = useEtymolog();
    return { isLoading, isReady, error };
}
