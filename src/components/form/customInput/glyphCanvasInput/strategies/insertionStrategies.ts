/**
 * Insertion Strategy Implementations
 *
 * Modular strategies for inserting/removing glyphs in the selection.
 * Follows the Strategy pattern for extensibility.
 *
 * @module glyphCanvasInput/strategies
 */

import type { InsertionStrategy, InsertionResult } from '../types';

// =============================================================================
// APPEND STRATEGY (Default)
// =============================================================================

/**
 * Creates an append-only insertion strategy.
 *
 * - Insert: Always appends to the end
 * - Remove: Always removes from the end (backspace behavior)
 * - Cursor is always null (no cursor concept)
 *
 * This is the default strategy and simplest behavior.
 *
 * @example
 * ```tsx
 * const strategy = createAppendStrategy();
 * const result = strategy.insert([1, 2], 3, null);
 * // result.selection = [1, 2, 3]
 * // result.cursor = null
 * ```
 */
export function createAppendStrategy(): InsertionStrategy {
    return {
        name: 'append',

        insert(currentSelection: number[], glyphId: number, _cursor: number | null): InsertionResult {
            return {
                selection: [...currentSelection, glyphId],
                cursor: null,
            };
        },

        remove(currentSelection: number[], _cursor: number | null): InsertionResult {
            if (currentSelection.length === 0) {
                return { selection: [], cursor: null };
            }
            return {
                selection: currentSelection.slice(0, -1),
                cursor: null,
            };
        },

        clear(): InsertionResult {
            return { selection: [], cursor: null };
        },
    };
}

// =============================================================================
// PREPEND STRATEGY (RTL Default)
// =============================================================================

/**
 * Creates a prepend insertion strategy for RTL writing systems.
 *
 * - Insert: Always prepends to the beginning
 * - Remove: Always removes from the beginning
 * - Cursor is always null
 *
 * @example
 * ```tsx
 * const strategy = createPrependStrategy();
 * const result = strategy.insert([1, 2], 3, null);
 * // result.selection = [3, 1, 2]
 * // result.cursor = null
 * ```
 */
export function createPrependStrategy(): InsertionStrategy {
    return {
        name: 'prepend',

        insert(currentSelection: number[], glyphId: number, _cursor: number | null): InsertionResult {
            return {
                selection: [glyphId, ...currentSelection],
                cursor: null,
            };
        },

        remove(currentSelection: number[], _cursor: number | null): InsertionResult {
            if (currentSelection.length === 0) {
                return { selection: [], cursor: null };
            }
            return {
                selection: currentSelection.slice(1),
                cursor: null,
            };
        },

        clear(): InsertionResult {
            return { selection: [], cursor: null };
        },
    };
}

// =============================================================================
// CURSOR-BASED STRATEGY (Future)
// =============================================================================

/**
 * Creates a cursor-based insertion strategy.
 *
 * - Insert: Inserts at cursor position, advances cursor
 * - Remove: Removes before cursor position (backspace), moves cursor back
 * - Cursor tracks current insertion point
 *
 * This strategy enables text-editor-like behavior for future enhancements.
 *
 * @example
 * ```tsx
 * const strategy = createCursorStrategy();
 *
 * // Start with cursor at end
 * let result = strategy.insert([1, 2], 3, 2);
 * // result.selection = [1, 2, 3]
 * // result.cursor = 3
 *
 * // Insert in middle
 * result = strategy.insert([1, 2, 3], 4, 1);
 * // result.selection = [1, 4, 2, 3]
 * // result.cursor = 2
 * ```
 */
export function createCursorStrategy(): InsertionStrategy {
    return {
        name: 'cursor',

        insert(currentSelection: number[], glyphId: number, cursor: number | null): InsertionResult {
            // If no cursor, append to end
            const insertPosition = cursor ?? currentSelection.length;

            // Clamp to valid range
            const clampedPosition = Math.max(0, Math.min(insertPosition, currentSelection.length));

            const newSelection = [
                ...currentSelection.slice(0, clampedPosition),
                glyphId,
                ...currentSelection.slice(clampedPosition),
            ];

            return {
                selection: newSelection,
                cursor: clampedPosition + 1,
            };
        },

        remove(currentSelection: number[], cursor: number | null): InsertionResult {
            if (currentSelection.length === 0) {
                return { selection: [], cursor: null };
            }

            // If no cursor, remove from end
            if (cursor === null) {
                return {
                    selection: currentSelection.slice(0, -1),
                    cursor: null,
                };
            }

            // Can't remove if cursor is at start
            if (cursor <= 0) {
                return {
                    selection: currentSelection,
                    cursor: 0,
                };
            }

            // Remove the glyph before cursor position
            const removePosition = cursor - 1;
            const newSelection = [
                ...currentSelection.slice(0, removePosition),
                ...currentSelection.slice(removePosition + 1),
            ];

            return {
                selection: newSelection,
                cursor: removePosition,
            };
        },

        clear(): InsertionResult {
            return { selection: [], cursor: 0 };
        },
    };
}

// =============================================================================
// STRATEGY FACTORY
// =============================================================================

/**
 * Gets the default insertion strategy for a writing direction.
 *
 * @param direction - Writing direction
 * @returns Appropriate insertion strategy
 */
export function getDefaultStrategyForDirection(
    direction: 'ltr' | 'rtl' | 'ttb' | 'btt' | 'custom'
): InsertionStrategy {
    switch (direction) {
        case 'rtl':
            // RTL still appends logically, the visual direction is handled by layout
            return createAppendStrategy();
        case 'btt':
            // Bottom-to-top still appends logically, visual handled by layout
            return createAppendStrategy();
        case 'ltr':
        case 'ttb':
        case 'custom':
        default:
            return createAppendStrategy();
    }
}

// =============================================================================
// DEFAULT EXPORT
// =============================================================================

/**
 * Default insertion strategy (append mode).
 */
export const defaultInsertionStrategy = createAppendStrategy();
