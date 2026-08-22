/**
 * Small sql.js helpers that return rows keyed by COLUMN NAME.
 *
 * `db.exec()` returns `{ columns, values }` and the services used to index
 * `values[i][7]` by hand. Two queries in the lexicon service selected columns
 * in a different order than their mapper expected, so ancestors came back with
 * a datetime in `glyph_order` and a position in `created_at`. Mapping by name
 * makes that class of bug impossible.
 */

import type { Database, SqlValue } from 'sql.js';

export type SqlRecord = Record<string, SqlValue>;

/** Run a query and return every row as a `{ column: value }` record. */
export function execRows(db: Database, sql: string, params?: SqlValue[]): SqlRecord[] {
    const result = db.exec(sql, params);
    if (result.length === 0) return [];
    const { columns, values } = result[0];
    return values.map(row => {
        const record: SqlRecord = {};
        for (let i = 0; i < columns.length; i++) {
            record[columns[i]] = row[i];
        }
        return record;
    });
}

/** First row or `null`. */
export function execOne(db: Database, sql: string, params?: SqlValue[]): SqlRecord | null {
    const rows = execRows(db, sql, params);
    return rows.length > 0 ? rows[0] : null;
}

/** First column of the first row (COUNT(*), last_insert_rowid(), …). */
export function execScalar<T extends SqlValue = SqlValue>(db: Database, sql: string, params?: SqlValue[]): T | undefined {
    const result = db.exec(sql, params);
    return result[0]?.values[0]?.[0] as T | undefined;
}

/** `last_insert_rowid()` as a number. */
export function lastInsertId(db: Database): number {
    return execScalar<number>(db, 'SELECT last_insert_rowid()') ?? 0;
}

/** Build `?, ?, ?` for an IN (...) clause. Returns `NULL` for an empty list so the query is still valid and matches nothing. */
export function inPlaceholders(count: number): string {
    return count === 0 ? 'NULL' : Array.from({ length: count }, () => '?').join(', ');
}
