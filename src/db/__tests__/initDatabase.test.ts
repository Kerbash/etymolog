/**
 * initDatabase concurrency — React StrictMode double-invokes effects and
 * several callers used to race `initDatabase()`, each constructing its own
 * `Database`. The in-flight promise guard makes every concurrent caller share
 * one instance.
 */

import { describe, it, expect } from 'vitest';
import { initDatabase, getDatabase, isDatabaseInitialized, closeDatabase } from '../database';

describe('initDatabase', () => {
    it('returns the same instance to concurrent callers', async () => {
        await closeDatabase();
        expect(isDatabaseInitialized()).toBe(false);
        const [a, b, c] = await Promise.all([initDatabase(), initDatabase(), initDatabase()]);
        expect(a).toBe(b);
        expect(b).toBe(c);
        expect(getDatabase()).toBe(a);
    });

    it('is idempotent once initialised', async () => {
        const first = await initDatabase();
        const second = await initDatabase();
        expect(second).toBe(first);
    });

    it('can be closed and re-opened', async () => {
        const first = await initDatabase();
        await closeDatabase();
        expect(isDatabaseInitialized()).toBe(false);
        const second = await initDatabase();
        expect(second).not.toBe(first);
        expect(isDatabaseInitialized()).toBe(true);
    });
});
