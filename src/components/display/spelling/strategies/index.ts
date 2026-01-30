/**
 * Layout Strategies Index
 *
 * Exports all layout strategies and provides a factory function
 * to get strategies by name.
 *
 * @module display/spelling/strategies
 */

import type { LayoutStrategy, LayoutStrategyType } from '../types';
import { ltrStrategy, rtlStrategy, ttbStrategy, bttStrategy } from './linearStrategy';
import { blockStrategy } from './blockStrategy';
import { spiralStrategy } from './spiralStrategy';
import { circularStrategy } from './circularStrategy';
import { boustrophedonStrategy } from './boustrophedonStrategy';

// Export individual strategies
export { ltrStrategy, rtlStrategy, ttbStrategy, bttStrategy } from './linearStrategy';
export { blockStrategy } from './blockStrategy';
export { spiralStrategy } from './spiralStrategy';
export { circularStrategy } from './circularStrategy';
export { boustrophedonStrategy } from './boustrophedonStrategy';

/**
 * Map of strategy names to strategy implementations.
 */
const strategyMap: Record<LayoutStrategyType, LayoutStrategy> = {
    ltr: ltrStrategy,
    rtl: rtlStrategy,
    ttb: ttbStrategy,
    btt: bttStrategy,
    spiral: spiralStrategy,
    block: blockStrategy,
    circular: circularStrategy,
    boustrophedon: boustrophedonStrategy,
};

/**
 * Get a layout strategy by name.
 *
 * @param name - Strategy name
 * @returns Layout strategy implementation
 */
export function getStrategy(name: LayoutStrategyType): LayoutStrategy {
    const strategy = strategyMap[name];
    if (!strategy) {
        console.warn(`Unknown layout strategy: ${name}, falling back to ltr`);
        return ltrStrategy;
    }
    return strategy;
}

/**
 * Get all available strategy names.
 */
export function getStrategyNames(): LayoutStrategyType[] {
    return Object.keys(strategyMap) as LayoutStrategyType[];
}

/**
 * Default strategy for when none is specified.
 */
export const defaultStrategy = ltrStrategy;
