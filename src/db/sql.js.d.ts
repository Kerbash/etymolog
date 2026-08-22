/**
 * SQL.js Type Declaration
 *
 * This file provides basic type declarations for sql.js when @types/sql.js
 * is not available or not working correctly.
 */

declare module 'sql.js' {
    export interface SqlJsStatic {
        Database: typeof Database;
    }

    export interface QueryExecResult {
        columns: string[];
        values: (number | string | Uint8Array | null)[][];
    }

    export interface BindParams {
        [key: string]: number | string | Uint8Array | null;
    }

    export type SqlValue = number | string | Uint8Array | null;

    export interface Statement {
        bind(params?: SqlValue[] | BindParams): boolean;
        step(): boolean;
        get(params?: SqlValue[] | BindParams): SqlValue[];
        getAsObject(params?: SqlValue[] | BindParams): Record<string, SqlValue>;
        run(params?: SqlValue[] | BindParams): void;
        reset(): void;
        free(): boolean;
    }

    export interface Database {
        run(sql: string, params?: SqlValue[] | BindParams): Database;
        exec(sql: string, params?: SqlValue[] | BindParams): QueryExecResult[];
        prepare(sql: string, params?: SqlValue[] | BindParams): Statement;
        export(): Uint8Array;
        close(): void;
        getRowsModified(): number;
    }

    export interface InitSqlJsOptions {
        locateFile?: (filename: string) => string;
    }

    export default function initSqlJs(options?: InitSqlJsOptions): Promise<SqlJsStatic>;
}
