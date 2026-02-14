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
    /** Must match WritingSystemSettings field name */
    key: string;
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
