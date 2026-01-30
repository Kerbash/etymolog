/**
 * Configuration Utilities
 *
 * Helper functions for resolving layout configurations.
 *
 * @module display/spelling/utils/config
 */

import type { LayoutStrategyConfig, LayoutPreset } from '../types';
import { DEFAULT_LAYOUT_CONFIG, LAYOUT_PRESETS } from '../types';

/**
 * Resolve layout config from partial config or preset name.
 *
 * @param config - Partial config object or preset name
 * @returns Fully resolved layout configuration
 */
export function resolveLayoutConfig(
    config: Partial<LayoutStrategyConfig> | LayoutPreset | undefined
): LayoutStrategyConfig {
    if (!config) {
        return DEFAULT_LAYOUT_CONFIG;
    }

    if (typeof config === 'string') {
        // It's a preset name
        return { ...DEFAULT_LAYOUT_CONFIG, ...LAYOUT_PRESETS[config] };
    }

    // It's a partial config
    return { ...DEFAULT_LAYOUT_CONFIG, ...config };
}
