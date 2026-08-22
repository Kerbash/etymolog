/**
 * The schema version stamped into `PRAGMA user_version` by `createSchema()`
 * and reached by running every entry of `MIGRATIONS` (see `./index.ts`).
 *
 * Lives in its own module so `schema.ts` (the DDL) and `index.ts` (the
 * registry) can both import it without importing each other.
 *
 * Bump it together with a new `MIGRATIONS` entry — `index.ts` asserts at load
 * time that the two agree.
 */
export const CURRENT_SCHEMA_VERSION = 6;
