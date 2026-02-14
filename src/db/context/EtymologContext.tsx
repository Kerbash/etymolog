/**
 * Etymolog Context
 *
 * Provides a React Context for the Etymolog API layer.
 * This is the "virtual backend" that separates UI concerns from data operations.
 *
 * Architecture:
 * - Frontend (UI components) → EtymologContext → API Layer → Database Services
 * - All operations go through the context, providing a clean separation of concerns
 * - The context manages state, subscriptions, and provides a unified API
 */

import {
    createContext,
    useContext,
    useState,
    useEffect,
    useCallback,
    useMemo,
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

import type {
    Glyph,
    GlyphWithUsage,
    GraphemeComplete,
    LexiconComplete,
} from '../types';

// =============================================================================
// CONTEXT TYPES
// =============================================================================

/**
 * Reactive data state managed by the context.
 * Components can subscribe to this data for automatic updates.
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
    /** Total glyph count */
    glyphCount: number;
    /** Total grapheme count */
    graphemeCount: number;
    /** Total lexicon count */
    lexiconCount: number;
}

/**
 * Context value exposed to consumers.
 */
export interface EtymologContextValue {
    /** The unified API for all operations */
    api: EtymologApi;
    /** Reactive data state */
    data: EtymologData;
    /** Current settings */
    settings: EtymologSettings;
    /** Whether the database is initializing */
    isLoading: boolean;
    /** Whether the database is ready for operations */
    isReady: boolean;
    /** Error during initialization, if any */
    error: Error | null;
    /** Refresh all data from the database */
    refresh: () => void;
    /** Refresh specific data types */
    refreshGlyphs: () => void;
    refreshGraphemes: () => void;
    refreshLexicon: () => void;
}

/**
 * Default empty data state.
 */
const EMPTY_DATA: EtymologData = {
    glyphs: [],
    glyphsWithUsage: [],
    graphemesComplete: [],
    lexiconComplete: [],
    glyphCount: 0,
    graphemeCount: 0,
    lexiconCount: 0,
};

// =============================================================================
// CONTEXT CREATION
// =============================================================================

const EtymologContext = createContext<EtymologContextValue | null>(null);

// =============================================================================
// PROVIDER COMPONENT
// =============================================================================

interface EtymologProviderProps {
    children: ReactNode;
}

/**
 * EtymologProvider
 *
 * Provides the Etymolog context to the component tree.
 * Handles database initialization and state management.
 *
 * @example
 * ```tsx
 * function App() {
 *   return (
 *     <EtymologProvider>
 *       <MyApp />
 *     </EtymologProvider>
 *   );
 * }
 * ```
 */
export function EtymologProvider({ children }: EtymologProviderProps) {
    // State
    const [isLoading, setIsLoading] = useState(true);
    const [isReady, setIsReady] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const [data, setData] = useState<EtymologData>(EMPTY_DATA);
    const [settings, setSettings] = useState<EtymologSettings>(getCurrentSettings);

    // Initialize database on mount
    useEffect(() => {
        let mounted = true;

        async function init() {
            try {
                await initDatabase();
                if (mounted) {
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

        init();

        return () => {
            mounted = false;
        };
    }, []);

    // Subscribe to settings changes
    useEffect(() => {
        const unsubscribe = subscribeToSettings((newSettings) => {
            setSettings(newSettings);
        });
        return unsubscribe;
    }, []);

    // Refresh glyphs data
    const refreshGlyphs = useCallback(() => {
        if (!isReady) return;

        const glyphsResponse = etymologApi.glyph.getAll();
        const glyphsWithUsageResponse = etymologApi.glyph.getAllWithUsage();

        if (glyphsResponse.success && glyphsWithUsageResponse.success) {
            setData(prev => ({
                ...prev,
                glyphs: glyphsResponse.data?.glyphs ?? [],
                glyphsWithUsage: glyphsWithUsageResponse.data?.glyphs ?? [],
                glyphCount: glyphsResponse.data?.total ?? 0,
            }));
        }
    }, [isReady]);

    // Refresh graphemes data
    const refreshGraphemes = useCallback(() => {
        if (!isReady) return;

        const graphemesResponse = etymologApi.grapheme.getAllComplete();

        if (graphemesResponse.success) {
            setData(prev => ({
                ...prev,
                graphemesComplete: graphemesResponse.data?.graphemes ?? [],
                graphemeCount: graphemesResponse.data?.total ?? 0,
            }));
        }
    }, [isReady]);

    // Refresh lexicon data
    const refreshLexicon = useCallback(() => {
        if (!isReady) return;

        const lexiconResponse = etymologApi.lexicon.getAllComplete();

        if (lexiconResponse.success) {
            setData(prev => ({
                ...prev,
                lexiconComplete: lexiconResponse.data?.entries ?? [],
                lexiconCount: lexiconResponse.data?.total ?? 0,
            }));
        }
    }, [isReady]);

    // Refresh all data
    const refresh = useCallback(() => {
        refreshGlyphs();
        refreshGraphemes();
        refreshLexicon();
    }, [refreshGlyphs, refreshGraphemes, refreshLexicon]);

    // Load data when database becomes ready
    useEffect(() => {
        if (isReady) {
            refresh();
        }
    }, [isReady, refresh]);

    // Create wrapped API that auto-refreshes after mutations
    const wrappedApi = useMemo((): EtymologApi => {
        // Helper to wrap a function and refresh after successful mutation
        const wrapWithRefresh = <T extends (...args: any[]) => ApiResponse<any>>(
            fn: T,
            refreshFn: () => void
        ): T => {
            return ((...args: Parameters<T>) => {
                const result = fn(...args);
                if (result.success) {
                    refreshFn();
                }
                return result;
            }) as T;
        };

        return {
            glyph: {
                ...etymologApi.glyph,
                create: wrapWithRefresh(etymologApi.glyph.create, refresh),
                // Glyph update must refresh all data since:
                // - graphemesComplete contains embedded Glyph[] (denormalized)
                // - lexiconComplete displays graphemes which contain glyphs
                update: wrapWithRefresh(etymologApi.glyph.update, refresh),
                delete: wrapWithRefresh(etymologApi.glyph.delete, refresh),
                forceDelete: wrapWithRefresh(etymologApi.glyph.forceDelete, refresh),
                cascadeDelete: wrapWithRefresh(etymologApi.glyph.cascadeDelete, refresh),
            },
            grapheme: {
                ...etymologApi.grapheme,
                create: wrapWithRefresh(etymologApi.grapheme.create, refresh),
                update: wrapWithRefresh(etymologApi.grapheme.update, refreshGraphemes),
                updateGlyphs: wrapWithRefresh(etymologApi.grapheme.updateGlyphs, refreshGraphemes),
                delete: wrapWithRefresh(etymologApi.grapheme.delete, refresh),
            },
            phoneme: {
                ...etymologApi.phoneme,
                add: wrapWithRefresh(etymologApi.phoneme.add, refreshGraphemes),
                update: wrapWithRefresh(etymologApi.phoneme.update, refreshGraphemes),
                delete: wrapWithRefresh(etymologApi.phoneme.delete, refreshGraphemes),
                deleteAllForGrapheme: wrapWithRefresh(etymologApi.phoneme.deleteAllForGrapheme, refreshGraphemes),
            },
            settings: etymologApi.settings,
            database: {
                ...etymologApi.database,
                clear: (() => {
                    const result = etymologApi.database.clear();
                    if (result.success) refresh();
                    return result;
                }) as typeof etymologApi.database.clear,
                reset: (() => {
                    const result = etymologApi.database.reset();
                    if (result.success) refresh();
                    return result;
                }) as typeof etymologApi.database.reset,
                import: async (file: File) => {
                    const result = await etymologApi.database.import(file);
                    if (result.success) refresh();
                    return result;
                },
            },
            lexicon: {
                ...etymologApi.lexicon,
                create: wrapWithRefresh(etymologApi.lexicon.create, refreshLexicon),
                update: wrapWithRefresh(etymologApi.lexicon.update, refreshLexicon),
                delete: wrapWithRefresh(etymologApi.lexicon.delete, refreshLexicon),
                updateSpelling: wrapWithRefresh(etymologApi.lexicon.updateSpelling, refreshLexicon),
                updateAncestry: wrapWithRefresh(etymologApi.lexicon.updateAncestry, refreshLexicon),
                applyAutoSpelling: wrapWithRefresh(etymologApi.lexicon.applyAutoSpelling, refreshLexicon),
            },
        };
    }, [refresh, refreshGlyphs, refreshGraphemes, refreshLexicon]);

    // Context value
    const contextValue = useMemo((): EtymologContextValue => ({
        api: wrappedApi,
        data,
        settings,
        isLoading,
        isReady,
        error,
        refresh,
        refreshGlyphs,
        refreshGraphemes,
        refreshLexicon,
    }), [wrappedApi, data, settings, isLoading, isReady, error, refresh, refreshGlyphs, refreshGraphemes, refreshLexicon]);

    return (
        <EtymologContext.Provider value={contextValue}>
            {children}
        </EtymologContext.Provider>
    );
}

// =============================================================================
// HOOKS
// =============================================================================

/**
 * useEtymolog
 *
 * Main hook for accessing the Etymolog context.
 * Provides access to the API, data, settings, and state.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { api, data, isLoading } = useEtymolog();
 *
 *   if (isLoading) return <Spinner />;
 *
 *   const handleCreate = () => {
 *     const result = api.glyph.create({ name: 'A', svg_data: '...' });
 *     if (!result.success) {
 *       console.error(result.error?.message);
 *     }
 *   };
 *
 *   return (
 *     <div>
 *       {data.glyphs.map(g => <GlyphCard key={g.id} glyph={g} />)}
 *     </div>
 *   );
 * }
 * ```
 */
export function useEtymolog(): EtymologContextValue {
    const context = useContext(EtymologContext);
    if (!context) {
        throw new Error('useEtymolog must be used within an EtymologProvider');
    }
    return context;
}

/**
 * useEtymologApi
 *
 * Convenience hook for accessing only the API.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const api = useEtymologApi();
 *   const result = api.glyph.create({ name: 'A', svg_data: '...' });
 * }
 * ```
 */
export function useEtymologApi(): EtymologApi {
    const { api } = useEtymolog();
    return api;
}

/**
 * useEtymologData
 *
 * Convenience hook for accessing only the reactive data.
 *
 * @example
 * ```tsx
 * function GlyphList() {
 *   const { glyphs, glyphCount } = useEtymologData();
 *   return <div>Total: {glyphCount}</div>;
 * }
 * ```
 */
export function useEtymologData(): EtymologData {
    const { data } = useEtymolog();
    return data;
}

/**
 * useEtymologSettings
 *
 * Convenience hook for accessing and updating settings.
 *
 * @example
 * ```tsx
 * function SettingsPanel() {
 *   const { settings, updateSettings } = useEtymologSettings();
 *
 *   return (
 *     <label>
 *       <input
 *         type="checkbox"
 *         checked={settings.simpleScriptSystem}
 *         onChange={(e) => updateSettings({ simpleScriptSystem: e.target.checked })}
 *       />
 *       Simple Script System
 *     </label>
 *   );
 * }
 * ```
 */
export function useEtymologSettings() {
    const { settings, api } = useEtymolog();

    const updateSettings = useCallback((updates: Partial<EtymologSettings>) => {
        return api.settings.update(updates);
    }, [api]);

    const resetSettings = useCallback(() => {
        return api.settings.reset();
    }, [api]);

    return {
        settings,
        updateSettings,
        resetSettings,
    };
}

/**
 * useEtymologStatus
 *
 * Convenience hook for accessing loading/ready state.
 *
 * @example
 * ```tsx
 * function LoadingGuard({ children }) {
 *   const { isLoading, isReady, error } = useEtymologStatus();
 *
 *   if (isLoading) return <Spinner />;
 *   if (error) return <Error message={error.message} />;
 *   if (!isReady) return null;
 *
 *   return children;
 * }
 * ```
 */
export function useEtymologStatus() {
    const { isLoading, isReady, error } = useEtymolog();
    return { isLoading, isReady, error };
}
