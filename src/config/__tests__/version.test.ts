/**
 * @fileoverview etymolog build-stamp wiring (VERSIONING.md).
 *
 * Two things matter here and neither is covered by the shared
 * `packages/utils-func/version/buildStamp.test.ts`:
 *
 *  1. `APP_VERSION` really tracks package.json. It used to be a hand-written
 *     literal that had drifted a whole minor version away — and unlike a footer
 *     typo, this number gets written into every export envelope, so a stale value
 *     mislabels user data permanently.
 *  2. `EXPORT_SCHEMA_VERSION` stays decoupled from it. The envelope schema
 *     version describes a data format importers must understand; bumping the app
 *     version must never move it.
 */

import { describe, it, expect } from 'vitest';

import { version as PACKAGE_VERSION } from '../../../package.json';
import { APP_VERSION, BUILD_INFO, EXPORT_SCHEMA_VERSION, formatBuildStamp } from '../version';

describe('APP_VERSION', () => {
    it('is derived from package.json, not hardcoded', () => {
        // version.ts imports the named `version` export straight from
        // package.json, so this holds under `vite dev`, `vite build` and vitest
        // alike — deliberately NOT via a bundler `define`, which vitest's SSR
        // transform ignores (that attempt silently yielded 0.0.0 in tests).
        expect(APP_VERSION).toBe(PACKAGE_VERSION);
    });

    it('is plain semver (the export envelope carries it verbatim)', () => {
        expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('is not the "unstamped" placeholder', () => {
        // A 0.0.0 here means the package.json import stopped resolving.
        expect(APP_VERSION).not.toBe('0.0.0');
    });
});

describe('EXPORT_SCHEMA_VERSION', () => {
    it('is a number describing the envelope shape, independent of APP_VERSION', () => {
        expect(typeof EXPORT_SCHEMA_VERSION).toBe('number');
        expect(EXPORT_SCHEMA_VERSION).toBe(1);
    });
});

describe('BUILD_INFO', () => {
    it('identifies the app and carries the git revision', () => {
        expect(BUILD_INFO.app).toBe('etymolog');
        expect(BUILD_INFO.version).toBe(PACKAGE_VERSION);
        // A real 40-char SHA on a git checkout; `unknown` from a source tarball.
        expect(BUILD_INFO.revision === 'unknown' || /^[0-9a-f]{40}$/.test(BUILD_INFO.revision)).toBe(true);
    });

    it('renders a footer stamp that starts with the version', () => {
        expect(formatBuildStamp()).toMatch(new RegExp(`^v${PACKAGE_VERSION.replace(/\./g, '\\.')}`));
    });
});
