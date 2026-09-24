/**
 * Block Scheme Service — the one-per-script block-script scheme (schema v9)
 *
 * The scheme lives in the single-row `block_scheme` table (`id = 1`, enforced
 * by a CHECK) as a JSON document. It is NEVER trusted as stored: every read
 * goes through `validateBlockScheme`, so a row written by an older build, a
 * hand-edited import or a half-written designer draft still yields a complete,
 * self-consistent scheme — the same lenient contract as the settings layer.
 *
 *   - no row             → the empty scheme (`enabled: false`), silently;
 *   - unparseable JSON   → the empty scheme, logged;
 *   - validation issues  → the CORRECTED scheme, issues logged.
 *
 * Writes store the CANONICAL JSON of the validated scheme (key order fixed by
 * the validator, unknown keys dropped), so what is on disk is always what the
 * engine will read back.
 *
 * Pure data layer: no React, no ApiResponse. See `api/blockSchemeApi.ts`.
 */

import { getDatabase } from './database';
import { withTransaction } from './utils/transaction';
import { execOne } from './utils/sql';
import { dbLog } from './utils/logger';
import { cloneEmptyBlockScheme, validateBlockScheme } from '../blocks/validate';
import type { BlockScheme, SchemeValidation } from '../blocks/types';
import { formatSchemeIssues, parseBlockSchemeDefinition, serializeBlockScheme } from './utils/blockSchemeCodec';

export { formatSchemeIssues, parseBlockSchemeDefinition, serializeBlockScheme };

/** The only row id the table admits. */
export const BLOCK_SCHEME_ROW_ID = 1;

/** The script's block scheme — the empty scheme when none has been saved. */
export function getBlockScheme(): BlockScheme {
    const row = execOne(getDatabase(), 'SELECT definition FROM block_scheme WHERE id = ?', [BLOCK_SCHEME_ROW_ID]);
    if (!row) return cloneEmptyBlockScheme();
    const { scheme, issues } = parseBlockSchemeDefinition(String(row.definition ?? ''));
    if (issues.length > 0) {
        dbLog.warn('Corrected stored block scheme:', formatSchemeIssues(issues));
    }
    return scheme;
}

/**
 * Validate `raw` and UPSERT the canonical form into the single row.
 *
 * Lenient like `getBlockScheme`: the CORRECTED scheme is what is stored and
 * returned, and `issues` says what was corrected (the API hands them to the
 * designer). A caller that wants to refuse a document with issues runs
 * `validateBlockScheme` first.
 */
export function saveBlockScheme(raw: unknown): SchemeValidation {
    const { scheme, issues } = validateBlockScheme(raw);
    const db = getDatabase();
    withTransaction(db, () => {
        db.run(
            `INSERT INTO block_scheme (id, definition, updated_at) VALUES (?, ?, datetime('now'))
             ON CONFLICT(id) DO UPDATE SET definition = excluded.definition, updated_at = excluded.updated_at`,
            [BLOCK_SCHEME_ROW_ID, serializeBlockScheme(scheme)],
        );
    });
    return { scheme, issues };
}
