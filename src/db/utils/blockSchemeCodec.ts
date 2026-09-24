/**
 * Block scheme codec — the stored `block_scheme.definition` string ⇄ a
 * validated `BlockScheme`. Pure (no database), so both the service and the
 * import validator (`exportImport/validateExport.ts`, which runs BEFORE the
 * database is touched) share one definition of "what a stored scheme means".
 *
 * @module db/utils/blockSchemeCodec
 */

import { cloneEmptyBlockScheme, validateBlockScheme } from '../../blocks/validate';
import type { BlockScheme, SchemeIssue, SchemeValidation } from '../../blocks/types';

/** `path: message` lines for logs, warnings and error details. */
export function formatSchemeIssues(issues: readonly SchemeIssue[]): string[] {
    return issues.map(issue => (issue.path ? `${issue.path}: ${issue.message}` : issue.message));
}

/**
 * The canonical stored form of a VALIDATED scheme. The validator builds every
 * object with a fixed key order and drops unknown keys, so equal schemes
 * serialize to equal strings.
 */
export function serializeBlockScheme(scheme: BlockScheme): string {
    return JSON.stringify(scheme);
}

/**
 * Parse + validate a stored `definition` string. Never throws: JSON that does
 * not parse is reported as one issue and yields the empty scheme.
 */
export function parseBlockSchemeDefinition(definition: string): SchemeValidation {
    let raw: unknown;
    try {
        raw = JSON.parse(definition);
    } catch (error) {
        return {
            scheme: cloneEmptyBlockScheme(),
            issues: [{
                path: '',
                message: `stored scheme is not valid JSON (${error instanceof Error ? error.message : String(error)}); defaulted to the empty scheme`,
            }],
        };
    }
    return validateBlockScheme(raw);
}
