/**
 * Etymolog Provider
 *
 * The React side of the two-layer architecture: components call the API
 * through this context and read reactive data from it.
 *
 *   UI components -> EtymologContext -> API layer -> services -> sql.js
 *
 * After a successful mutation the context refreshes exactly the slices that
 * mutation can have changed (the refresh MATRIX below) - creating a word does
 * not re-read every grapheme, updating a glyph does not re-read the lexicon.
 * A refresh that fails is recorded in `data.lastRefreshError` instead of being
 * dropped on the floor, and the persistence scheduler's state is exposed so
 * the shell can show "Saved / Saving / Unsaved" and storage errors.
 *
 * This file exports ONLY the provider component; the context object, its types
 * and the consumer hooks live in `./etymologContext` so Fast Refresh works.
 */

import {
    useState,
    useEffect,
    useCallback,
    useMemo,
    useRef,
    type ReactNode,
} from 'react';

import {
    etymologApi,
    initDatabase,
    getCurrentSettings,
    subscribeToSettings,
    type EtymologApi,
    type EtymologSettings,
    type ApiResponse,
} from '../api';
import { getDatabaseHealth, type DatabaseHealth } from '../database';
import { getPersistenceState, subscribePersistence, type PersistenceState } from '../persistence';

import {
    EtymologContext,
    EMPTY_DATA,
    type EtymologContextValue,
    type EtymologData,
    type RefreshError,
} from './etymologContext';

// =============================================================================
// PROVIDER COMPONENT
// =============================================================================

interface EtymologProviderProps {
    children: ReactNode;
}

type AnyApiFn = (...args: never[]) => ApiResponse<unknown>;
type Slice = 'glyphs' | 'graphemes' | 'lexicon' | 'folders' | 'glyphFolders' | 'graphemeFolders';

/** The one order refreshes ever run in, wherever they are triggered from. */
const SLICE_ORDER: readonly Slice[] = ['glyphs', 'graphemes', 'lexicon', 'folders', 'glyphFolders', 'graphemeFolders'];

/**
 * EtymologProvider
 *
 * Provides the Etymolog context to the component tree.
 * Handles database initialization and state management.
 */
export function EtymologProvider({ children }: EtymologProviderProps) {
    const [isLoading, setIsLoading] = useState(true);
    const [isReady, setIsReady] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const [data, setData] = useState<EtymologData>(EMPTY_DATA);
    const [settings, setSettings] = useState<EtymologSettings>(getCurrentSettings);
    const [persistence, setPersistence] = useState<PersistenceState>(getPersistenceState);
    const [health, setHealth] = useState<DatabaseHealth>(getDatabaseHealth);
    // Refresh callbacks must not go stale inside the memoised API wrapper.
    const isReadyRef = useRef(false);

    // Initialize database on mount (initDatabase is idempotent under StrictMode)
    useEffect(() => {
        let mounted = true;

        async function init() {
            try {
                await initDatabase();
                if (mounted) {
                    isReadyRef.current = true;
                    setHealth(getDatabaseHealth());
                    setPersistence(getPersistenceState());
                    setIsReady(true);
                    setError(null);
                }
            } catch (err) {
                if (mounted) {
                    setError(err instanceof Error ? err : new Error('Database initialization failed'));
                }
            } finally {
                if (mounted) {
                    setIsLoading(false);
                }
            }
        }

        void init();

        return () => {
            mounted = false;
        };
    }, []);

    useEffect(() => subscribeToSettings(setSettings), []);
    useEffect(() => subscribePersistence(setPersistence), []);

    const recordFailure = useCallback((slice: Slice, response: ApiResponse<unknown>) => {
        setData(prev => ({
            ...prev,
            lastRefreshError: {
                slice,
                message: response.error?.message ?? `Failed to load ${slice}`,
                at: new Date().toISOString(),
            },
        }));
    }, []);

    const clearFailure = (prev: EtymologData, slice: Slice): RefreshError | null =>
        prev.lastRefreshError?.slice === slice ? null : prev.lastRefreshError;

    const refreshGlyphs = useCallback(() => {
        if (!isReadyRef.current) return;
        const glyphsResponse = etymologApi.glyph.getAll();
        const usageResponse = etymologApi.glyph.getAllWithUsage();
        if (!glyphsResponse.success) return recordFailure('glyphs', glyphsResponse);
        if (!usageResponse.success) return recordFailure('glyphs', usageResponse);
        setData(prev => ({
            ...prev,
            glyphs: glyphsResponse.data?.glyphs ?? [],
            glyphsWithUsage: usageResponse.data?.glyphs ?? [],
            glyphCount: glyphsResponse.data?.total ?? 0,
            lastRefreshError: clearFailure(prev, 'glyphs'),
        }));
    }, [recordFailure]);

    const refreshGraphemes = useCallback(() => {
        if (!isReadyRef.current) return;
        const response = etymologApi.grapheme.getAllComplete();
        if (!response.success) return recordFailure('graphemes', response);
        setData(prev => ({
            ...prev,
            graphemesComplete: response.data?.graphemes ?? [],
            graphemeCount: response.data?.total ?? 0,
            lastRefreshError: clearFailure(prev, 'graphemes'),
        }));
    }, [recordFailure]);

    const refreshLexicon = useCallback(() => {
        if (!isReadyRef.current) return;
        const response = etymologApi.lexicon.getAllComplete();
        if (!response.success) return recordFailure('lexicon', response);
        setData(prev => ({
            ...prev,
            lexiconComplete: response.data?.entries ?? [],
            lexiconCount: response.data?.total ?? 0,
            lastRefreshError: clearFailure(prev, 'lexicon'),
        }));
    }, [recordFailure]);

    const refreshFolders = useCallback(() => {
        if (!isReadyRef.current) return;
        const response = etymologApi.folder.list();
        if (!response.success) return recordFailure('folders', response);
        setData(prev => ({
            ...prev,
            folders: response.data ?? [],
            lastRefreshError: clearFailure(prev, 'folders'),
        }));
    }, [recordFailure]);

    const refreshGlyphFolders = useCallback(() => {
        if (!isReadyRef.current) return;
        const response = etymologApi.glyphFolder.list();
        if (!response.success) return recordFailure('glyphFolders', response);
        setData(prev => ({
            ...prev,
            glyphFolders: response.data ?? [],
            lastRefreshError: clearFailure(prev, 'glyphFolders'),
        }));
    }, [recordFailure]);

    const refreshGraphemeFolders = useCallback(() => {
        if (!isReadyRef.current) return;
        const response = etymologApi.graphemeFolder.list();
        if (!response.success) return recordFailure('graphemeFolders', response);
        setData(prev => ({
            ...prev,
            graphemeFolders: response.data ?? [],
            lastRefreshError: clearFailure(prev, 'graphemeFolders'),
        }));
    }, [recordFailure]);

    const refresh = useCallback(() => {
        refreshGlyphs();
        refreshGraphemes();
        refreshLexicon();
        refreshFolders();
        refreshGlyphFolders();
        refreshGraphemeFolders();
    }, [refreshGlyphs, refreshGraphemes, refreshLexicon, refreshFolders, refreshGlyphFolders, refreshGraphemeFolders]);

    // Load data when database becomes ready
    useEffect(() => {
        if (isReady) {
            refresh();
            setHealth(getDatabaseHealth());
        }
    }, [isReady, refresh]);

    /**
     * How many `batchMutations` calls are currently open.
     *
     * A DEPTH rather than a boolean so the primitive is re-entrant: a helper
     * that batches internally can be called from a loop that also batches, and
     * only the outermost close flushes. A ref rather than state because the
     * whole batch runs inside one synchronous call — a render can never be
     * scheduled in the middle of it, so state would be read stale.
     */
    const batchDepth = useRef(0);
    /** Slices a mutation inside the open batch changed, waiting for the flush. */
    const pendingSlices = useRef<Set<Slice>>(new Set());

    /** Refresh now, or record the slice for the flush if a batch is open. */
    const requestRefresh = useCallback((slice: Slice) => {
        if (batchDepth.current > 0) {
            pendingSlices.current.add(slice);
            return;
        }
        if (slice === 'glyphs') refreshGlyphs();
        else if (slice === 'graphemes') refreshGraphemes();
        else if (slice === 'folders') refreshFolders();
        else if (slice === 'glyphFolders') refreshGlyphFolders();
        else if (slice === 'graphemeFolders') refreshGraphemeFolders();
        else refreshLexicon();
    }, [refreshGlyphs, refreshGraphemes, refreshLexicon, refreshFolders, refreshGlyphFolders, refreshGraphemeFolders]);

    const batchMutations = useCallback(<T,>(fn: () => T): T => {
        batchDepth.current += 1;
        try {
            return fn();
        } finally {
            batchDepth.current -= 1;
            if (batchDepth.current === 0) {
                // Drained BEFORE the refreshes run, so a refresh that somehow
                // re-entered could not see a stale pending set — and so a throw
                // out of one refresh cannot leave the next batch replaying it.
                const slices = pendingSlices.current;
                pendingSlices.current = new Set();
                // Fixed order, not insertion order: the three refreshes are
                // independent, and a deterministic order makes the call counts
                // in a test mean the same thing every run.
                if (slices.has('glyphs')) refreshGlyphs();
                if (slices.has('graphemes')) refreshGraphemes();
                if (slices.has('lexicon')) refreshLexicon();
                if (slices.has('folders')) refreshFolders();
                if (slices.has('glyphFolders')) refreshGlyphFolders();
                if (slices.has('graphemeFolders')) refreshGraphemeFolders();
            }
        }
    }, [refreshGlyphs, refreshGraphemes, refreshLexicon, refreshFolders, refreshGlyphFolders, refreshGraphemeFolders]);

    // Wrapped API: every mutation refreshes the slices it can have changed.
    const wrappedApi = useMemo((): EtymologApi => {
        const after = <T extends AnyApiFn>(fn: T, ...slices: Slice[]): T => {
            return ((...args: Parameters<T>) => {
                const result = fn(...args);
                if (result.success) {
                    // Canonical order, not argument order, so the sequence of
                    // refreshes does not depend on how a call site happened to
                    // list its slices.
                    for (const slice of SLICE_ORDER) {
                        if (slices.includes(slice)) requestRefresh(slice);
                    }
                }
                return result;
            }) as T;
        };
        const afterAll = <T extends AnyApiFn>(fn: T): T => after(fn, 'glyphs', 'graphemes', 'lexicon');
        // A whole-database operation (clear / reset) wipes the folder tables too,
        // so it must refresh the three folder slices as well — otherwise a cleared
        // or reset database leaves a stale folder tree on screen until a reload.
        const afterAllWithFolders = <T extends AnyApiFn>(fn: T): T =>
            after(fn, 'glyphs', 'graphemes', 'lexicon', 'folders', 'glyphFolders', 'graphemeFolders');

        return {
            glyph: {
                ...etymologApi.glyph,
                create: after(etymologApi.glyph.create, 'glyphs'),
                // Graphemes embed glyph SVGs; the lexicon resolves graphemes through graphemesComplete.
                update: after(etymologApi.glyph.update, 'glyphs', 'graphemes'),
                delete: after(etymologApi.glyph.delete, 'glyphs'),
                forceDelete: afterAll(etymologApi.glyph.forceDelete),
                cascadeDelete: afterAll(etymologApi.glyph.cascadeDelete),
            },
            grapheme: {
                ...etymologApi.grapheme,
                // A new grapheme's phonemes respell the auto-spelled words
                // that were waiting for them.
                create: after(etymologApi.grapheme.create, 'graphemes', 'glyphs', 'lexicon'),
                update: after(etymologApi.grapheme.update, 'graphemes'),
                updateGlyphs: after(etymologApi.grapheme.updateGlyphs, 'graphemes', 'glyphs'),
                // May respell words and (with autoManageGlyphs) remove glyphs.
                delete: afterAll(etymologApi.grapheme.delete),
            },
            // Every phoneme write respells the auto-spelled words it affects
            // (see `respellService`), so each one re-reads the lexicon too.
            phoneme: {
                ...etymologApi.phoneme,
                add: after(etymologApi.phoneme.add, 'graphemes', 'lexicon'),
                update: after(etymologApi.phoneme.update, 'graphemes', 'lexicon'),
                delete: after(etymologApi.phoneme.delete, 'graphemes', 'lexicon'),
                deleteAllForGrapheme: after(etymologApi.phoneme.deleteAllForGrapheme, 'graphemes', 'lexicon'),
                replaceAll: after(etymologApi.phoneme.replaceAll, 'graphemes', 'lexicon'),
            },
            settings: etymologApi.settings,
            database: {
                ...etymologApi.database,
                clear: afterAllWithFolders(etymologApi.database.clear),
                reset: afterAllWithFolders(etymologApi.database.reset),
                repair: ((...args: Parameters<typeof etymologApi.database.repair>) => {
                    const result = etymologApi.database.repair(...args);
                    if (result.success) {
                        refresh();
                        // The repair changed what boot would find — re-sample so the
                        // shell banner clears without faking a dismissal.
                        setHealth(getDatabaseHealth());
                    }
                    return result;
                }) as typeof etymologApi.database.repair,
                import: async (file: File) => {
                    const result = await etymologApi.database.import(file);
                    if (result.success) {
                        refresh();
                        setHealth(getDatabaseHealth());
                    }
                    return result;
                },
            },
            lexicon: {
                ...etymologApi.lexicon,
                // A composite create CAN also make a symbol glyph + grapheme, but
                // it stays a lexicon-slice refresh: the word form calls the full
                // `refresh()` after a create anyway, and broadening this here
                // would make every plain word create needlessly re-read glyphs
                // and graphemes.
                create: after(etymologApi.lexicon.create, 'lexicon'),
                update: after(etymologApi.lexicon.update, 'lexicon'),
                delete: after(etymologApi.lexicon.delete, 'lexicon'),
                updateSpelling: after(etymologApi.lexicon.updateSpelling, 'lexicon'),
                updateAncestry: after(etymologApi.lexicon.updateAncestry, 'lexicon'),
                applyAutoSpelling: after(etymologApi.lexicon.applyAutoSpelling, 'lexicon'),
            },
            phrase: etymologApi.phrase,
            // A word symbol is a glyph + grapheme; a re-drawn symbol changes the
            // glyph the lexicon resolves through graphemesComplete.
            wordSymbol: {
                ...etymologApi.wordSymbol,
                create: afterAll(etymologApi.wordSymbol.create),
                updateDrawing: afterAll(etymologApi.wordSymbol.updateDrawing),
            },
            // The `folders` slice (added in 5b) backs the gallery tree and the
            // form/move pickers, so every folder mutation refreshes it. The two
            // that also touch WORD rows — filing a word, and deleting a folder
            // (which reparents its words to the parent) — refresh the lexicon
            // slice too so a word's `folder_id` stays current.
            folder: {
                ...etymologApi.folder,
                create: after(etymologApi.folder.create, 'folders'),
                update: after(etymologApi.folder.update, 'folders'),
                rename: after(etymologApi.folder.rename, 'folders'),
                move: after(etymologApi.folder.move, 'folders'),
                delete: after(etymologApi.folder.delete, 'folders', 'lexicon'),
                setItemFolder: after(etymologApi.folder.setItemFolder, 'lexicon'),
                setLexiconFolder: after(etymologApi.folder.setLexiconFolder, 'lexicon'),
            },
            // Glyph folders (schema v8), mirroring the lexicon `folder` wiring.
            // Filing a glyph and deleting a folder (reparents its glyphs) both
            // change a glyph's `folder_id`, so they refresh the `glyphs` slice.
            glyphFolder: {
                ...etymologApi.glyphFolder,
                create: after(etymologApi.glyphFolder.create, 'glyphFolders'),
                update: after(etymologApi.glyphFolder.update, 'glyphFolders'),
                rename: after(etymologApi.glyphFolder.rename, 'glyphFolders'),
                move: after(etymologApi.glyphFolder.move, 'glyphFolders'),
                delete: after(etymologApi.glyphFolder.delete, 'glyphFolders', 'glyphs'),
                setItemFolder: after(etymologApi.glyphFolder.setItemFolder, 'glyphs'),
            },
            // Grapheme folders (schema v8); a grapheme's `folder_id` lives in the
            // `graphemes` slice (graphemesComplete), so item moves and folder
            // deletes refresh it.
            graphemeFolder: {
                ...etymologApi.graphemeFolder,
                create: after(etymologApi.graphemeFolder.create, 'graphemeFolders'),
                update: after(etymologApi.graphemeFolder.update, 'graphemeFolders'),
                rename: after(etymologApi.graphemeFolder.rename, 'graphemeFolders'),
                move: after(etymologApi.graphemeFolder.move, 'graphemeFolders'),
                delete: after(etymologApi.graphemeFolder.delete, 'graphemeFolders', 'graphemes'),
                setItemFolder: after(etymologApi.graphemeFolder.setItemFolder, 'graphemes'),
            },
        };
    }, [refresh, requestRefresh]);

    const contextValue = useMemo((): EtymologContextValue => ({
        api: wrappedApi,
        data,
        settings,
        persistence,
        health,
        isLoading,
        isReady,
        error,
        refresh,
        refreshGlyphs,
        refreshGraphemes,
        refreshLexicon,
        refreshFolders,
        refreshGlyphFolders,
        refreshGraphemeFolders,
        batchMutations,
    }), [wrappedApi, data, settings, persistence, health, isLoading, isReady, error, refresh, refreshGlyphs, refreshGraphemes, refreshLexicon, refreshFolders, refreshGlyphFolders, refreshGraphemeFolders, batchMutations]);

    return (
        <EtymologContext.Provider value={contextValue}>
            {children}
        </EtymologContext.Provider>
    );
}
