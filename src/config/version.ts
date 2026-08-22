/**
 * Centralized version constants for Etymolog.
 *
 * - `APP_VERSION` — semantic version of the running application. Derived at BUILD
 *   time from `apps/etymolog/package.json` (see `VERSIONING.md` at the repo root);
 *   bump it with `pnpm version:bump etymolog patch|minor|major`. Exposed in the
 *   footer and stamped (informationally) into every export envelope so users can
 *   tell which build produced a file.
 *
 *   It used to be a hand-written literal here (`'0.1.0'`) while package.json said
 *   `0.0.0`. That is the drift the versioning system exists to kill — and here it
 *   was worse than cosmetic, because the number was written into exported user
 *   data. There is now exactly one place a version is authored.
 *
 * - `EXPORT_SCHEMA_VERSION` — version of the export envelope schema. Bump only
 *   on a *breaking* change to the envelope shape (renamed/removed tables or
 *   columns, changed `magic`, etc.). Adding new optional fields with safe
 *   defaults during import does NOT require bumping — see the
 *   `lexicon_meanings` migration in `db/exportImport/jsonCodec.ts` as the
 *   reference pattern for a non-breaking schema addition.
 *
 *   Deliberately INDEPENDENT of `APP_VERSION`: it describes a data format that
 *   importers must understand, not the build that happens to be running. Do not
 *   couple them.
 *
 * - `BUILD_INFO` / `formatBuildStamp()` — the full build stamp (version, commit,
 *   build time), shared with every other app in the monorepo via
 *   `utils-func/version/buildStamp`.
 */

import {
    createBuildInfo,
    formatBuildStamp as formatStamp,
    type BuildInfo,
    type RawBuildEnv,
} from 'utils-func/version/buildStamp';

// The version comes from package.json via a real import, not from a bundler
// `define`. Vite serves JSON as an ES module and tree-shakes to this one named
// export, so the rest of the manifest never reaches the bundle — and unlike a
// `define`, this resolves identically under `vite dev`, `vite build`, and vitest.
import { version as PACKAGE_VERSION } from '../../package.json';

/**
 * Git identity, injected by `vite.config.ts`'s `define` block.
 *
 * A plain global rather than `import.meta.env.VITE_*`: a `define` on
 * `import.meta.env.X` only applies where Vite does text replacement, while under
 * vitest `import.meta.env` is a real object — those reads came back undefined.
 *
 * Vitest does not apply `define` to its SSR transform at all, so under test this
 * identifier is genuinely absent and the git fields read `unknown`. That is the
 * correct answer there: a test run is not a build. The VERSION, which is the
 * value stamped into user export envelopes, does not depend on this.
 */
declare const __BUILD_STAMP__: Omit<RawBuildEnv, 'version'> | undefined;

export const BUILD_INFO: BuildInfo = createBuildInfo('etymolog', {
    ...(typeof __BUILD_STAMP__ !== 'undefined' && __BUILD_STAMP__ ? __BUILD_STAMP__ : {}),
    version: PACKAGE_VERSION,
});

export const APP_VERSION = BUILD_INFO.version;

export const EXPORT_SCHEMA_VERSION = 1;

/** `v0.1.0 · a1b2c3d · 2026.07.24 20:54 UTC` for the footer. */
export function formatBuildStamp(info: BuildInfo = BUILD_INFO): string {
    return formatStamp(info);
}
