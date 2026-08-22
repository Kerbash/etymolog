/**
 * Test Setup
 * 
 * Configures the test environment for SQL.js database operations.
 * - Mocks localStorage for data persistence
 * - Sets up global window object for environment detection
 */

// Mock localStorage
const localStorageMock = {
    store: {} as Record<string, string>,
    getItem(key: string) {
        return this.store[key] || null;
    },
    setItem(key: string, value: string) {
        this.store[key] = value;
    },
    removeItem(key: string) {
        delete this.store[key];
    },
    clear() {
        this.store = {};
    }
};

// Set up global localStorage
(globalThis as typeof globalThis & { localStorage: Storage }).localStorage =
    localStorageMock as unknown as Storage;

// Node has no DOM, so DOMPurify cannot sanitise; service tests store SVG as-is.
// Production never sets this flag — see src/db/utils/sanitize.ts.
(globalThis as Record<string, unknown>).__ETYMOLOG_ALLOW_UNSANITIZED_SVG__ = true;

// Don't set window - this will make the database use Node.js mode
// which allows sql.js to find the WASM file automatically
