/**
 * React Hooks for Database Operations
 *
 * Provides easy-to-use React integration for managing graphemes and phonemes.
 * Handles database initialization, state management, and CRUD operations.
 */

import { useState, useEffect, useCallback } from 'react';
import { initDatabase } from './database';
import {
    createGrapheme,
    getAllGraphemes,
    getAllGraphemesWithPhonemes,
    getGraphemeById,
    getGraphemeWithPhonemes,
    updateGrapheme,
    deleteGrapheme,
    searchGraphemesByName,
    getGraphemeCount
} from './graphemeService';
import type {
    Grapheme,
    CreateGraphemeInput,
    UpdateGraphemeInput,
    GraphemeWithPhonemes
} from './types';

// =============================================================================
// TYPES
// =============================================================================

interface UseGraphemesResult {
    /** All graphemes (without phonemes) */
    graphemes: Grapheme[];
    /** All graphemes with their phonemes */
    graphemesWithPhonemes: GraphemeWithPhonemes[];
    /** Loading state during initialization */
    isLoading: boolean;
    /** Error state if something went wrong */
    error: Error | null;
    /** Total count of graphemes */
    count: number;

    // CRUD Operations
    /** Create a new grapheme with optional phonemes */
    create: (input: CreateGraphemeInput) => Promise<GraphemeWithPhonemes>;
    /** Update an existing grapheme */
    update: (id: number, input: UpdateGraphemeInput) => Promise<Grapheme | null>;
    /** Delete a grapheme and all its phonemes */
    remove: (id: number) => Promise<boolean>;
    /** Get a single grapheme by ID */
    getById: (id: number) => Grapheme | null;
    /** Get a single grapheme with its phonemes by ID */
    getByIdWithPhonemes: (id: number) => GraphemeWithPhonemes | null;
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
 * function LogogramList() {
 *   const { graphemes, isLoading, create, remove } = useGraphemes();
 *
 *   if (isLoading) return <Spinner />;
 *
 *   return (
 *     <ul>
 *       {graphemes.map(g => (
 *         <li key={g.id}>
 *           {g.name}
 *           <button onClick={() => remove(g.id)}>Delete</button>
 *         </li>
 *       ))}
 *     </ul>
 *   );
 * }
 */
export function useGraphemes(): UseGraphemesResult {
    const [graphemes, setGraphemes] = useState<Grapheme[]>([]);
    const [graphemesWithPhonemes, setGraphemesWithPhonemes] = useState<GraphemeWithPhonemes[]>([]);
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
            setGraphemesWithPhonemes(getAllGraphemesWithPhonemes());
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

    const create = useCallback(async (input: CreateGraphemeInput): Promise<GraphemeWithPhonemes> => {
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

    const getByIdWithPhonemesFn = useCallback((id: number): GraphemeWithPhonemes | null => {
        if (!isInitialized) return null;
        return getGraphemeWithPhonemes(id);
    }, [isInitialized]);

    const searchFn = useCallback((query: string): Grapheme[] => {
        if (!isInitialized) return [];
        return searchGraphemesByName(query);
    }, [isInitialized]);

    return {
        graphemes,
        graphemesWithPhonemes,
        isLoading,
        error,
        count,
        create,
        update,
        remove,
        getById: getByIdFn,
        getByIdWithPhonemes: getByIdWithPhonemesFn,
        search: searchFn,
        refresh
    };
}

/**
 * Hook for checking database initialization status.
 * Use this when you only need to know if the database is ready.
 *
 * @example
 * function App() {
 *   const { isReady, isLoading, error } = useDatabase();
 *
 *   if (isLoading) return <Spinner />;
 *   if (error) return <ErrorMessage error={error} />;
 *   if (!isReady) return <InitializingMessage />;
 *
 *   return <MainContent />;
 * }
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
