/**
 * Settings API
 *
 * In-memory settings with localStorage persistence (key `etymolog_settings_v1`).
 * Every value that enters — from storage, from an import, from `update()` — is
 * run through `validateSettings()` so the in-memory object is always complete
 * and well-typed, and every successful change notifies subscribers so the React
 * context never goes stale (reset and import included — both used to bypass
 * the listeners).
 */

import type {
    ApiResponse,
    ApiErrorCode,
    EtymologSettings,
    UpdateSettingsInput,
    SettingsApi,
    SettingsImportResult,
} from './types';
import { cloneDefaultSettings, validateSettings, type SettingsIssue } from './settingsSchema';
import { settingsLog } from '../utils/logger';

// Storage key for settings persistence
export const SETTINGS_STORAGE_KEY = 'etymolog_settings_v1';

// In-memory settings state
let currentSettings: EtymologSettings = cloneDefaultSettings();
let isInitialized = false;

type SettingsListener = (settings: EtymologSettings) => void;
const listeners: Set<SettingsListener> = new Set();

function errorResponse<T>(
    code: ApiErrorCode,
    message: string,
    details?: Record<string, unknown>
): ApiResponse<T> {
    return { success: false, error: { code, message, details } };
}

function successResponse<T>(data: T): ApiResponse<T> {
    return { success: true, data };
}

function formatIssues(issues: SettingsIssue[]): string[] {
    return issues.map(issue => (issue.path ? `${issue.path}: ${issue.message}` : issue.message));
}

function hasStorage(): boolean {
    return typeof localStorage !== 'undefined';
}

/**
 * Load settings from localStorage, correcting anything malformed.
 */
function loadSettingsFromStorage(): EtymologSettings {
    if (!hasStorage()) return cloneDefaultSettings();
    try {
        const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
        if (!stored) return cloneDefaultSettings();
        const { settings, issues } = validateSettings(JSON.parse(stored));
        if (issues.length > 0) {
            settingsLog.warn('Corrected stored settings:', formatIssues(issues));
        }
        return settings;
    } catch (error) {
        settingsLog.warn('Failed to load settings from localStorage:', error);
        return cloneDefaultSettings();
    }
}

function saveSettingsToStorage(settings: EtymologSettings): void {
    if (!hasStorage()) return;
    try {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
        settingsLog.warn('Failed to save settings to localStorage:', error);
    }
}

function initializeSettings(): void {
    if (isInitialized) return;
    currentSettings = loadSettingsFromStorage();
    isInitialized = true;
}

function snapshot(): EtymologSettings {
    return structuredClone(currentSettings);
}

function notifySettingsListeners(): void {
    const settings = snapshot();
    listeners.forEach(listener => listener(settings));
}

function commit(next: EtymologSettings): void {
    currentSettings = next;
    saveSettingsToStorage(currentSettings);
    notifySettingsListeners();
}

function getSettings(): ApiResponse<EtymologSettings> {
    initializeSettings();
    return successResponse(snapshot());
}

/**
 * Partial update. Strict: any invalid value rejects the whole update.
 */
function updateSettings(updates: UpdateSettingsInput): ApiResponse<EtymologSettings> {
    initializeSettings();
    try {
        const { settings, issues } = validateSettings({ ...currentSettings, ...updates });
        if (issues.length > 0) {
            return errorResponse('VALIDATION_ERROR', `Invalid settings: ${formatIssues(issues).join('; ')}`, {
                issues: formatIssues(issues),
            });
        }
        commit(settings);
        return successResponse(snapshot());
    } catch (error) {
        return errorResponse(
            'OPERATION_FAILED',
            error instanceof Error ? error.message : 'Failed to update settings'
        );
    }
}

function resetSettings(): ApiResponse<EtymologSettings> {
    initializeSettings();
    try {
        commit(cloneDefaultSettings());
        return successResponse(snapshot());
    } catch (error) {
        return errorResponse(
            'OPERATION_FAILED',
            error instanceof Error ? error.message : 'Failed to reset settings'
        );
    }
}

/**
 * Replace settings wholesale from an untrusted source (import envelope).
 * Lenient: malformed values are corrected and reported in `details.warnings`.
 */
function importSettings(raw: unknown): ApiResponse<SettingsImportResult> {
    initializeSettings();
    try {
        const { settings, issues } = validateSettings(raw);
        commit(settings);
        const warnings = formatIssues(issues);
        if (warnings.length > 0) {
            settingsLog.warn('Corrected imported settings:', warnings);
        }
        return successResponse({ settings: snapshot(), warnings });
    } catch (error) {
        return errorResponse(
            'OPERATION_FAILED',
            error instanceof Error ? error.message : 'Failed to import settings'
        );
    }
}

export const settingsApi: SettingsApi = {
    get: getSettings,
    update: updateSettings,
    reset: resetSettings,
    import: importSettings,
};

/**
 * Direct access to current settings (for use in context).
 * Returns a copy to prevent external mutation.
 */
export function getCurrentSettings(): EtymologSettings {
    initializeSettings();
    return snapshot();
}

/**
 * Subscribe to settings changes. Returns an unsubscribe function.
 */
export function subscribeToSettings(listener: SettingsListener): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/** Tests only: forget the loaded state so the next access re-reads storage. */
export function resetSettingsForTests(): void {
    currentSettings = cloneDefaultSettings();
    isInitialized = false;
    listeners.clear();
}
