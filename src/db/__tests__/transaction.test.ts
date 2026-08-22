/**
 * Transaction helper tests — nesting via savepoints, rollback, and the
 * persist-once-per-outer-commit guarantee.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { initDatabase, clearDatabase, getDatabase, exportDatabaseBytes, PERSISTED_SCHEMA_VERSION } from '../database';
import { withTransaction, getTransactionDepth, resetTransactionDepthForTests } from '../utils/transaction';
import { configurePersistence, createMemoryAdapter, resetPersistenceForTests } from '../persistence';

function countGlyphs(): number {
    return getDatabase().exec('SELECT COUNT(*) FROM glyphs')[0].values[0][0] as number;
}

describe('withTransaction', () => {
    beforeAll(async () => {
        await initDatabase();
    });

    beforeEach(() => {
        clearDatabase();
        resetTransactionDepthForTests();
        resetPersistenceForTests();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        resetPersistenceForTests();
    });

    it('commits and returns the callback result', () => {
        const db = getDatabase();
        const result = withTransaction(db, () => {
            db.run("INSERT INTO glyphs (name, svg_data) VALUES ('a', '<svg/>')");
            return 42;
        });
        expect(result).toBe(42);
        expect(countGlyphs()).toBe(1);
        expect(getTransactionDepth()).toBe(0);
    });

    it('rolls back every statement when the callback throws', () => {
        const db = getDatabase();
        expect(() => withTransaction(db, () => {
            db.run("INSERT INTO glyphs (name, svg_data) VALUES ('a', '<svg/>')");
            db.run("INSERT INTO glyphs (name, svg_data) VALUES ('b', '<svg/>')");
            throw new Error('boom');
        })).toThrow('boom');
        expect(countGlyphs()).toBe(0);
        expect(getTransactionDepth()).toBe(0);
    });

    it('nests as savepoints: an inner failure rolls back only the inner work', () => {
        const db = getDatabase();
        withTransaction(db, () => {
            db.run("INSERT INTO glyphs (name, svg_data) VALUES ('outer', '<svg/>')");
            expect(() => withTransaction(db, () => {
                expect(getTransactionDepth()).toBe(2);
                db.run("INSERT INTO glyphs (name, svg_data) VALUES ('inner', '<svg/>')");
                throw new Error('inner');
            })).toThrow('inner');
            expect(getTransactionDepth()).toBe(1);
        });
        const names = getDatabase().exec('SELECT name FROM glyphs')[0].values.map(r => r[0]);
        expect(names).toEqual(['outer']);
    });

    it('an outer failure discards committed inner savepoints', () => {
        const db = getDatabase();
        expect(() => withTransaction(db, () => {
            withTransaction(db, () => {
                db.run("INSERT INTO glyphs (name, svg_data) VALUES ('inner', '<svg/>')");
            });
            throw new Error('outer');
        })).toThrow('outer');
        expect(countGlyphs()).toBe(0);
    });

    it('schedules exactly one persist per outermost commit', async () => {
        const adapter = createMemoryAdapter();
        configurePersistence({ adapter, exportBytes: exportDatabaseBytes, schemaVersion: PERSISTED_SCHEMA_VERSION, debounceMs: 10 });
        const db = getDatabase();
        withTransaction(db, () => {
            withTransaction(db, () => {
                db.run("INSERT INTO glyphs (name, svg_data) VALUES ('x', '<svg/>')");
            });
            withTransaction(db, () => {
                db.run("INSERT INTO glyphs (name, svg_data) VALUES ('y', '<svg/>')");
            });
        });
        await vi.advanceTimersByTimeAsync(50);
        expect(adapter.saveCount).toBe(1);
    });

    it('refuses to export while a transaction is open', () => {
        const db = getDatabase();
        withTransaction(db, () => {
            expect(() => exportDatabaseBytes()).toThrow(/transaction is open/);
        });
    });
});
