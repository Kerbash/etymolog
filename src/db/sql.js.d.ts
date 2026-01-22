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

    export interface Database {
        run(sql: string, params?: (number | string | null)[]): Database;
        exec(sql: string, params?: (number | string | null)[]): QueryExecResult[];
        export(): Uint8Array;
        close(): void;
        getRowsModified(): number;
    }

    export interface InitSqlJsOptions {
        locateFile?: (filename: string) => string;
    }

    export default function initSqlJs(options?: InitSqlJsOptions): Promise<SqlJsStatic>;
}
