/**
 * Transaction helper
 *
 * `withTransaction(db, fn)` runs `fn` inside a SQLite transaction and schedules
 * ONE persist when the outermost transaction commits. Nested calls become
 * SAVEPOINTs, so a service that calls another service (createLexicon →
 * addAncestorToLexicon) composes without "cannot start a transaction within a
 * transaction".
 *
 * Why the depth counter is module-level rather than per-`Database`: the app has
 * exactly one live connection, and `exportDatabaseBytes()` must be able to ask
 * "is a transaction open?" without a handle — sql.js's `export()` closes and
 * reopens the connection, which would silently roll back an open transaction.
 *
 * If ROLLBACK itself fails the connection state is unknown; we surface that as
 * `TransactionRollbackFailed` so the caller (import) can restore from a
 * snapshot instead of trusting the in-memory database.
 */

import type { Database } from 'sql.js';
import { schedulePersist } from '../persistence/scheduler';

let depth = 0;

export class TransactionRollbackFailed extends Error {
    readonly original: unknown;
    readonly rollbackError: unknown;

    constructor(original: unknown, rollbackError: unknown) {
        super('Transaction rollback failed; the in-memory database may be inconsistent.');
        this.name = 'TransactionRollbackFailed';
        this.original = original;
        this.rollbackError = rollbackError;
    }
}

export function getTransactionDepth(): number {
    return depth;
}

export function withTransaction<T>(db: Database, fn: () => T): T {
    if (depth === 0) {
        db.run('BEGIN IMMEDIATE');
        depth = 1;
        let result: T;
        try {
            result = fn();
        } catch (error) {
            depth = 0;
            try {
                db.run('ROLLBACK');
            } catch (rollbackError) {
                throw new TransactionRollbackFailed(error, rollbackError);
            }
            throw error;
        }
        try {
            db.run('COMMIT');
        } catch (commitError) {
            // The transaction is still open after a failed COMMIT. Roll it back
            // so the connection is usable and the export guard tells the truth.
            depth = 0;
            try {
                db.run('ROLLBACK');
            } catch (rollbackError) {
                throw new TransactionRollbackFailed(commitError, rollbackError);
            }
            throw commitError;
        }
        depth = 0;
        schedulePersist();
        return result;
    }

    const savepoint = `sp_${depth}`;
    db.run(`SAVEPOINT ${savepoint}`);
    depth++;
    let result: T;
    try {
        result = fn();
    } catch (error) {
        depth--;
        try {
            db.run(`ROLLBACK TO ${savepoint}`);
            db.run(`RELEASE ${savepoint}`);
        } catch (rollbackError) {
            throw new TransactionRollbackFailed(error, rollbackError);
        }
        throw error;
    }
    try {
        db.run(`RELEASE ${savepoint}`);
    } finally {
        depth--;
    }
    return result;
}

/** Tests only. */
export function resetTransactionDepthForTests(): void {
    depth = 0;
}
