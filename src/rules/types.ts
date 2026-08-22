/**
 * Typography Rule Type Definitions
 *
 * Defines the interface for modular typography rules that
 * control writing system behavior.
 *
 * @module rules/types
 */

export interface TypographyRuleOption {
    value: string;
    label: string;
    description: string;
}

export interface TypographyRule {
    /** The WritingSystemSettings field this rule edits — typed so the catalog cannot drift from the settings shape */
    key: keyof import('../db/api/types').WritingSystemSettings;
    /** Display name */
    label: string;
    /** What this rule controls */
    description: string;
    /** For grouping in UI */
    category: string;
    /** Available options */
    options: TypographyRuleOption[];
    /** Default value */
    defaultValue: string;
    /** Display ordering */
    priority: number;
}
