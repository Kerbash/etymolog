/**
 * Structural probes shared by the migration registry (`./index.ts`) and the
 * orphan repair (`./repair.ts`).
 *
 * They live in their own module so `repair.ts` can ask "does this table /
 * column exist yet?" without importing the registry (which imports
 * `repair.ts` — a cycle). `repairOrphans` needs the answer because migration
 * v6 calls it against a v5-shaped database that has no variant tables, while
 * the live database and the import path call it against the current shape.
 */

import type { Database } from 'sql.js';

export function tableExists(database: Database, table: string): boolean {
    const result = database.exec(
        `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`,
        [table]
    );
    return result.length > 0 && result[0].values.length > 0;
}

export function columnExists(database: Database, table: string, column: string): boolean {
    const result = database.exec(`PRAGMA table_info(${table})`);
    return result.length > 0 && result[0].values.some(row => row[1] === column);
}
