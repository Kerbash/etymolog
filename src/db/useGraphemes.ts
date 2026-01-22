/**
 * React Hook for Grapheme Operations
 *
 * Provides easy-to-use React integration for managing graphemes.
 * Handles database initialization, state management, and CRUD operations.
 *
 * Note: Graphemes are now compositions of glyphs. Use useGlyphs() for
 * managing the atomic visual symbols.
 */

import { useState, useEffect, useCallback } from 'react';
import { initDatabase } from './database';
import {
    createGrapheme,
    getAllGraphemes,
    getAllGraphemesComplete,
    getAllGraphemesWithGlyphs,
    getAllGraphemesWithPhonemes,
    getGraphemeById,
    getGraphemeComplete,
    getGraphemeWithGlyphs,
    getGraphemeWithPhonemes,
    updateGrapheme,
    deleteGrapheme,
    searchGraphemesByName,
    getGraphemeCount,
    setGraphemeGlyphs
} from './graphemeService';
import type {
    Grapheme,
    CreateGraphemeInput,
    UpdateGraphemeInput,
    GraphemeComplete,
    GraphemeWithGlyphs,
    GraphemeWithPhonemes,
    CreateGraphemeGlyphInput
} from './types';

// =============================================================================
// TYPES
// =============================================================================

interface UseGraphemesResult {
    /** All graphemes (basic info only) */
    graphemes: Grapheme[];
    /** All graphemes with their glyphs */
    graphemesWithGlyphs: GraphemeWithGlyphs[];
    /** All graphemes with their phonemes */
    graphemesWithPhonemes: GraphemeWithPhonemes[];
    /** All graphemes with full data (glyphs + phonemes) */
    graphemesComplete: GraphemeComplete[];
    /** Loading state during initialization */
    isLoading: boolean;
    /** Error state if something went wrong */
    error: Error | null;
    /** Total count of graphemes */
    count: number;

    // CRUD Operations
    /** Create a new grapheme with glyphs and optional phonemes */
    create: (input: CreateGraphemeInput) => Promise<GraphemeComplete>;
    /** Update a grapheme's basic info */
    update: (id: number, input: UpdateGraphemeInput) => Promise<Grapheme | null>;
    /** Update a grapheme's glyph composition */
    updateGlyphs: (id: number, glyphs: CreateGraphemeGlyphInput[]) => Promise<void>;
    /** Delete a grapheme */
    remove: (id: number) => Promise<boolean>;
    /** Get a single grapheme by ID */
    getById: (id: number) => Grapheme | null;
    /** Get a grapheme with its glyphs */
    getByIdWithGlyphs: (id: number) => GraphemeWithGlyphs | null;
    /** Get a grapheme with its phonemes */
    getByIdWithPhonemes: (id: number) => GraphemeWithPhonemes | null;
    /** Get a grapheme with full data */
    getByIdComplete: (id: number) => GraphemeComplete | null;
    /** Search graphemes by name */
    search: (query: string) => Grapheme[];

    // Utility
    /** Refresh all data from the database */
    refresh: () => void;
}

interface UseDatabaseResult {
    /** Whether the database is ready for operations */
    isReady: boolean;
    /** Loading state during initialization */
    isLoading: boolean;
    /** Error state if initialization failed */
    error: Error | null;
}

// =============================================================================
// HOOKS
// =============================================================================

/**
 * Hook for managing graphemes with automatic database initialization.
 *
 * @example
 * function GraphemeList() {
 *   const { graphemesComplete, isLoading, create, remove } = useGraphemes();
 *
 *   if (isLoading) return <Spinner />;
 *
 *   return (
 *     <ul>
 *       {graphemesComplete.map(g => (
 *         <li key={g.id}>
 *           {g.name} - {g.glyphs.length} glyph(s)
 *           <button onClick={() => remove(g.id)}>Delete</button>
 *         </li>
 *       ))}
 *     </ul>
 *   );
 * }
 */
export function useGraphemes(): UseGraphemesResult {
    const [graphemes, setGraphemes] = useState<Grapheme[]>([]);
    const [graphemesWithGlyphs, setGraphemesWithGlyphs] = useState<GraphemeWithGlyphs[]>([]);
    const [graphemesWithPhonemes, setGraphemesWithPhonemes] = useState<GraphemeWithPhonemes[]>([]);
    const [graphemesComplete, setGraphemesComplete] = useState<GraphemeComplete[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const [count, setCount] = useState(0);
    const [isInitialized, setIsInitialized] = useState(false);

    // Initialize database on mount
    useEffect(() => {
        let mounted = true;

        async function init() {
            try {
                await initDatabase();
                if (mounted) {
                    setIsInitialized(true);
                    setError(null);
                }
            } catch (err) {
                if (mounted) {
                    setError(err instanceof Error ? err : new Error('Failed to initialize database'));
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

    // Refresh data from database
    const refresh = useCallback(() => {
        if (!isInitialized) return;

        try {
            setGraphemes(getAllGraphemes());
            setGraphemesWithGlyphs(getAllGraphemesWithGlyphs());
            setGraphemesWithPhonemes(getAllGraphemesWithPhonemes());
            setGraphemesComplete(getAllGraphemesComplete());
            setCount(getGraphemeCount());
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Failed to fetch graphemes'));
        }
    }, [isInitialized]);

    // Load data when initialized
    useEffect(() => {
        refresh();
    }, [refresh]);

    // CRUD Operations

    const create = useCallback(async (input: CreateGraphemeInput): Promise<GraphemeComplete> => {
        if (!isInitialized) {
            throw new Error('Database not initialized');
        }

        const grapheme = createGrapheme(input);
        refresh();
        return grapheme;
    }, [isInitialized, refresh]);

    const update = useCallback(async (id: number, input: UpdateGraphemeInput): Promise<Grapheme | null> => {
        if (!isInitialized) {
            throw new Error('Database not initialized');
        }

        const grapheme = updateGrapheme(id, input);
        refresh();
        return grapheme;
    }, [isInitialized, refresh]);

    const updateGlyphsFn = useCallback(async (id: number, glyphs: CreateGraphemeGlyphInput[]): Promise<void> => {
        if (!isInitialized) {
            throw new Error('Database not initialized');
        }

        setGraphemeGlyphs(id, glyphs);
        refresh();
    }, [isInitialized, refresh]);

    const remove = useCallback(async (id: number): Promise<boolean> => {
        if (!isInitialized) {
            throw new Error('Database not initialized');
        }

        const success = deleteGrapheme(id);
        if (success) {
            refresh();
        }
        return success;
    }, [isInitialized, refresh]);

    const getByIdFn = useCallback((id: number): Grapheme | null => {
        if (!isInitialized) return null;
        return getGraphemeById(id);
    }, [isInitialized]);

    const getByIdWithGlyphsFn = useCallback((id: number): GraphemeWithGlyphs | null => {
        if (!isInitialized) return null;
        return getGraphemeWithGlyphs(id);
    }, [isInitialized]);

    const getByIdWithPhonemesFn = useCallback((id: number): GraphemeWithPhonemes | null => {
        if (!isInitialized) return null;
        return getGraphemeWithPhonemes(id);
    }, [isInitialized]);

    const getByIdCompleteFn = useCallback((id: number): GraphemeComplete | null => {
        if (!isInitialized) return null;
        return getGraphemeComplete(id);
    }, [isInitialized]);

    const searchFn = useCallback((query: string): Grapheme[] => {
        if (!isInitialized) return [];
        return searchGraphemesByName(query);
    }, [isInitialized]);

    return {
        graphemes,
        graphemesWithGlyphs,
        graphemesWithPhonemes,
        graphemesComplete,
        isLoading,
        error,
        count,
        create,
        update,
        updateGlyphs: updateGlyphsFn,
        remove,
        getById: getByIdFn,
        getByIdWithGlyphs: getByIdWithGlyphsFn,
        getByIdWithPhonemes: getByIdWithPhonemesFn,
        getByIdComplete: getByIdCompleteFn,
        search: searchFn,
        refresh
    };
}

/**
 * Hook for checking database initialization status.
 */
export function useDatabase(): UseDatabaseResult {
    const [isReady, setIsReady] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

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

    return { isReady, isLoading, error };
}
