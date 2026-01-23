/**
 * Settings API
 *
 * Manages application settings in memory with optional localStorage persistence.
 * Settings are session-scoped but persist across page reloads via localStorage.
 */

import type {
    ApiResponse,
    ApiErrorCode,
    EtymologSettings,
    UpdateSettingsInput,
    SettingsApi,
} from './types';
import { DEFAULT_SETTINGS as defaults } from './types';

// Storage key for settings persistence
const SETTINGS_STORAGE_KEY = 'etymolog_settings_v1';

// In-memory settings state
let currentSettings: EtymologSettings = { ...defaults };
let isInitialized = false;

/**
 * Helper to create a standardized error response.
 */
function errorResponse<T>(
    code: ApiErrorCode,
    message: string,
    details?: Record<string, unknown>
): ApiResponse<T> {
    return {
        success: false,
        error: { code, message, details },
    };
}

/**
 * Helper to create a successful response.
 */
function successResponse<T>(data: T): ApiResponse<T> {
    return {
        success: true,
        data,
    };
}

/**
 * Load settings from localStorage if available.
 */
function loadSettingsFromStorage(): EtymologSettings {
    try {
        const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored) as Partial<EtymologSettings>;
            // Merge with defaults to ensure all fields exist
            return {
                ...defaults,
                ...parsed,
            };
        }
    } catch (error) {
        console.warn('[Settings] Failed to load settings from localStorage:', error);
    }
    return { ...defaults };
}

/**
 * Save settings to localStorage.
 */
function saveSettingsToStorage(settings: EtymologSettings): void {
    try {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
        console.warn('[Settings] Failed to save settings to localStorage:', error);
    }
}

/**
 * Initialize settings (called automatically on first access).
 */
function initializeSettings(): void {
    if (isInitialized) return;
    currentSettings = loadSettingsFromStorage();
    isInitialized = true;
}

/**
 * Get current settings.
 */
function getSettings(): ApiResponse<EtymologSettings> {
    initializeSettings();
    return successResponse({ ...currentSettings });
}

/**
 * Update settings (partial update).
 */
function updateSettings(updates: UpdateSettingsInput): ApiResponse<EtymologSettings> {
    initializeSettings();

    try {
        // Validate settings if needed
        if (updates.autoSaveInterval !== undefined && updates.autoSaveInterval < 0) {
            return errorResponse('VALIDATION_ERROR', 'Auto-save interval cannot be negative');
        }

        // Apply updates
        currentSettings = {
            ...currentSettings,
            ...updates,
        };

        // Persist to localStorage
        saveSettingsToStorage(currentSettings);

        return successResponse({ ...currentSettings });
    } catch (error) {
        return errorResponse(
            'OPERATION_FAILED',
            error instanceof Error ? error.message : 'Failed to update settings'
        );
    }
}

/**
 * Reset settings to defaults.
 */
function resetSettings(): ApiResponse<EtymologSettings> {
    try {
        currentSettings = { ...defaults };
        saveSettingsToStorage(currentSettings);
        return successResponse({ ...currentSettings });
    } catch (error) {
        return errorResponse(
            'OPERATION_FAILED',
            error instanceof Error ? error.message : 'Failed to reset settings'
        );
    }
}

/**
 * Settings API implementation.
 */
export const settingsApi: SettingsApi = {
    get: getSettings,
    update: updateSettings,
    reset: resetSettings,
};

/**
 * Direct access to current settings (for use in context).
 * Returns a copy to prevent external mutation.
 */
export function getCurrentSettings(): EtymologSettings {
    initializeSettings();
    return { ...currentSettings };
}

/**
 * Subscribe to settings changes.
 * Returns an unsubscribe function.
 */
type SettingsListener = (settings: EtymologSettings) => void;
const listeners: Set<SettingsListener> = new Set();

export function subscribeToSettings(listener: SettingsListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/**
 * Notify all listeners of settings changes.
 */
function notifySettingsListeners(): void {
    const settings = { ...currentSettings };
    listeners.forEach(listener => listener(settings));
}

// Wrap updateSettings to notify listeners
const originalUpdate = updateSettings;
function updateSettingsWithNotify(updates: UpdateSettingsInput): ApiResponse<EtymologSettings> {
    const result = originalUpdate(updates);
    if (result.success) {
        notifySettingsListeners();
    }
    return result;
}

// Replace the update function in the API
settingsApi.update = updateSettingsWithNotify;
