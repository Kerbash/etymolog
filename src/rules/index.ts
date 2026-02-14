/**
 * Typography Rules Registry
 *
 * Central registry for all typography rules. Provides lookup and
 * categorization utilities for the Writing System UI.
 *
 * To add a new rule:
 * 1. Create a rule file in the appropriate subfolder (directionality/ or layout/)
 * 2. Export it from the subfolder's index.ts
 * 3. Add it to the ALL_RULES array below
 * 4. Add the corresponding field to WritingSystemSettings in types.ts
 *
 * @module rules
 */

import type { TypographyRule } from './types';
import { glyphDirectionRule, wordOrderRule, lineProgressionRule } from './directionality';
import { glyphStackingRule, wordWrapRule, baselineAlignmentRule } from './layout';

export type { TypographyRule, TypographyRuleOption } from './types';

const ALL_RULES: TypographyRule[] = [
    glyphDirectionRule,
    wordOrderRule,
    lineProgressionRule,
    glyphStackingRule,
    wordWrapRule,
    baselineAlignmentRule,
];

/** Get all rules sorted by priority. */
export function getAllRules(): TypographyRule[] {
    return [...ALL_RULES].sort((a, b) => a.priority - b.priority);
}

/** Get rules for a specific category. */
export function getRulesByCategory(category: string): TypographyRule[] {
    return ALL_RULES
        .filter(r => r.category === category)
        .sort((a, b) => a.priority - b.priority);
}

/** Get a rule by its key. */
export function getRuleByKey(key: string): TypographyRule | undefined {
    return ALL_RULES.find(r => r.key === key);
}

/** Get all unique category names in priority order. */
export function getRuleCategories(): string[] {
    const seen = new Set<string>();
    const categories: string[] = [];
    for (const rule of getAllRules()) {
        if (!seen.has(rule.category)) {
            seen.add(rule.category);
            categories.push(rule.category);
        }
    }
    return categories;
}
