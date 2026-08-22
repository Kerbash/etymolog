/**
 * Development-only Logger
 *
 * Provides a logging facade that only outputs in development mode.
 * In production builds, all log calls are no-ops.
 */

const isDev = import.meta.env.DEV;

function noop() {}

function createLogger(prefix: string) {
    if (!isDev) {
        return { info: noop, warn: noop, error: noop };
    }

    return {
        info: (...args: unknown[]) => console.log(`[${prefix}]`, ...args),
        warn: (...args: unknown[]) => console.warn(`[${prefix}]`, ...args),
        error: (...args: unknown[]) => console.error(`[${prefix}]`, ...args),
    };
}

export const dbLog = createLogger('DB');
export const settingsLog = createLogger('Settings');
export const serviceLog = createLogger('Service');
