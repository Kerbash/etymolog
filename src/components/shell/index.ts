/**
 * Barrel for the app shell — the header / nav / footer chrome that every
 * conlang page renders inside, plus the two cross-cutting services it owns
 * (unsaved-changes protection and the persistence/health surface).
 */

export { default as AppShell } from './AppShell';
export { default as AppBackground } from './AppBackground';
export { default as AppHeader } from './AppHeader';
export { default as AppNav } from './AppNav';
export { default as AppFooter } from './AppFooter';
export {
    PersistenceStatusText,
    ShellStatusBanner,
    SHELL_BANNER_OFFSET_TOP,
} from './PersistenceStatus';
export { UnsavedChangesRegistry, useUnsavedChanges, useRegisterUnsaved } from './unsavedChanges';
export type { UnsavedChangesApi } from './unsavedChanges';
