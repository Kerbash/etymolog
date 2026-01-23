/**
 * React Hook for Glyph Operations
 *
 * Provides easy-to-use React integration for managing glyphs.
 * Handles database initialization, state management, and CRUD operations.
 */

import { useState, useEffect, useCallback } from 'react';
import { initDatabase } from './database';
import {
    createGlyph,
    getAllGlyphs,
    getAllGlyphsWithUsage,
    getGlyphById,
    updateGlyph,
    deleteGlyph,
    cascadeDeleteGlyph,
    searchGlyphsByName,
    getGlyphCount,
    getGlyphReferences
} from './glyphService';
import type {
    Glyph,
    CreateGlyphInput,
    UpdateGlyphInput,
    GlyphWithUsage,
    GlyphReference
} from './types';

// =============================================================================
// TYPES
// =============================================================================

interface UseGlyphsResult {
    /** All glyphs */
    glyphs: Glyph[];
    /** All glyphs with usage count */
    glyphsWithUsage: GlyphWithUsage[];
    /** Lightweight glyph references for selection UI */
    glyphReferences: GlyphReference[];
    /** Loading state during initialization */
    isLoading: boolean;
    /** Error state if something went wrong */
    error: Error | null;
    /** Total count of glyphs */
    count: number;

    // CRUD Operations
    /** Create a new glyph */
    create: (input: CreateGlyphInput) => Promise<Glyph>;
    /** Update an existing glyph */
    update: (id: number, input: UpdateGlyphInput) => Promise<Glyph | null>;
    /** Delete a glyph (fails if in use) */
    remove: (id: number) => Promise<boolean>;
    /** Delete a glyph and all graphemes that reference it */
    cascadeRemove: (id: number) => Promise<boolean>;
    /** Get a single glyph by ID */
    getById: (id: number) => Glyph | null;
    /** Search glyphs by name */
    search: (query: string) => Glyph[];

    // Utility
    /** Refresh all data from the database */
    refresh: () => void;
}

// =============================================================================
// HOOK
// =============================================================================

/**
 * Hook for managing glyphs with automatic database initialization.
 *
 * @example
 * function GlyphLibrary() {
 *   const { glyphs, isLoading, create, remove } = useGlyphs();
 *
 *   if (isLoading) return <Spinner />;
 *
 *   return (
 *     <div className="glyph-grid">
 *       {glyphs.map(g => (
 *         <GlyphCard key={g.id} glyph={g} onDelete={() => remove(g.id)} />
 *       ))}
 *     </div>
 *   );
 * }
 */
export function useGlyphs(): UseGlyphsResult {
    const [glyphs, setGlyphs] = useState<Glyph[]>([]);
    const [glyphsWithUsage, setGlyphsWithUsage] = useState<GlyphWithUsage[]>([]);
    const [glyphReferences, setGlyphReferences] = useState<GlyphReference[]>([]);
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
            setGlyphs(getAllGlyphs());
            setGlyphsWithUsage(getAllGlyphsWithUsage());
            setGlyphReferences(getGlyphReferences());
            setCount(getGlyphCount());
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Failed to fetch glyphs'));
        }
    }, [isInitialized]);

    // Load data when initialized
    useEffect(() => {
        refresh();
    }, [refresh]);

    // CRUD Operations

    const create = useCallback(async (input: CreateGlyphInput): Promise<Glyph> => {
        if (!isInitialized) {
            throw new Error('Database not initialized');
        }

        const glyph = createGlyph(input);
        refresh();
        return glyph;
    }, [isInitialized, refresh]);

    const update = useCallback(async (id: number, input: UpdateGlyphInput): Promise<Glyph | null> => {
        if (!isInitialized) {
            throw new Error('Database not initialized');
        }

        const glyph = updateGlyph(id, input);
        refresh();
        return glyph;
    }, [isInitialized, refresh]);

    const remove = useCallback(async (id: number): Promise<boolean> => {
        if (!isInitialized) {
            throw new Error('Database not initialized');
        }

        const success = deleteGlyph(id);
        if (success) {
            refresh();
        }
        return success;
    }, [isInitialized, refresh]);

    const cascadeRemove = useCallback(async (id: number): Promise<boolean> => {
        if (!isInitialized) {
            throw new Error('Database not initialized');
        }

        const success = cascadeDeleteGlyph(id);
        if (success) {
            refresh();
        }
        return success;
    }, [isInitialized, refresh]);

    const getByIdFn = useCallback((id: number): Glyph | null => {
        if (!isInitialized) return null;
        return getGlyphById(id);
    }, [isInitialized]);

    const searchFn = useCallback((query: string): Glyph[] => {
        if (!isInitialized) return [];
        return searchGlyphsByName(query);
    }, [isInitialized]);

    return {
        glyphs,
        glyphsWithUsage,
        glyphReferences,
        isLoading,
        error,
        count,
        create,
        update,
        remove,
        cascadeRemove,
        getById: getByIdFn,
        search: searchFn,
        refresh
    };
}
