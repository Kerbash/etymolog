/**
 * Block scheme storage (BLOCK_SCRIPT_PLAN Phase 3, storage half)
 *
 *   - a fresh database has no row and reads as the empty (disabled) scheme;
 *   - save → get round-trips, stores the CANONICAL validated JSON in the one
 *     row (`id = 1`), and a second save overwrites it;
 *   - a stored row that does not parse, or that validates with issues, reads
 *     as the default / corrected scheme and is logged — never thrown;
 *   - JSON export → import keeps the scheme; a corrupt `definition` in an
 *     envelope imports as the default (or corrected) scheme with a report
 *     warning and never fails the import.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

import { initDatabase, clearDatabase, getDatabase } from '../database';
import { getBlockScheme, saveBlockScheme, BLOCK_SCHEME_ROW_ID } from '../blockSchemeService';
import { blockSchemeApi } from '../api/blockSchemeApi';
import { etymologApi } from '../api';
import { collectExportData, exportDataToJson, importExportData, parseAndValidateJson } from '../exportImport/jsonCodec';
import { resetSettingsForTests } from '../api/settingsApi';
import { dbLog } from '../utils/logger';
import { EMPTY_BLOCK_SCHEME } from '../../blocks';
import type { BlockScheme } from '../../blocks';

const SCHEME: BlockScheme = {
    version: 1,
    enabled: true,
    roles: [
        { id: 'C1', label: 'Onset', matcher: { kind: 'class', letter: 'C' } },
        { id: 'V', label: 'Nucleus', matcher: { kind: 'class', letter: 'V' } },
    ],
    templates: [
        {
            id: 'cv',
            name: 'CV',
            pattern: ['C1', 'V'],
            slots: [
                { roleId: 'C1', groupId: null, x: 0, y: 0, w: 1, h: 0.5 },
                { roleId: 'V', groupId: 3, x: 0, y: 0.5, w: 1, h: 0.5 },
            ],
        },
    ],
};

const TS = '2026-01-01 00:00:00';

function storedRows(): unknown[][] {
    return getDatabase().exec('SELECT id, definition FROM block_scheme')[0]?.values ?? [];
}

function writeRawRow(definition: string): void {
    getDatabase().run('INSERT OR REPLACE INTO block_scheme (id, definition) VALUES (1, ?)', [definition]);
}

function mentionsScheme(warning: string): boolean {
    return /block scheme/i.test(warning);
}

describe('block scheme service + API', () => {
    beforeAll(async () => {
        await initDatabase();
    });
    beforeEach(() => {
        clearDatabase();
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('a fresh database has no row and reads as the empty, disabled scheme', () => {
        expect(storedRows()).toEqual([]);
        expect(getBlockScheme()).toEqual(EMPTY_BLOCK_SCHEME);
        const response = blockSchemeApi.get();
        expect(response.success).toBe(true);
        expect(response.data).toEqual({ version: 1, enabled: false, roles: [], templates: [] });
    });

    it('the default returned is a fresh object — mutating it cannot leak into the next read', () => {
        const first = getBlockScheme();
        first.roles.push({ id: 'X', label: 'X', matcher: { kind: 'any' } });
        expect(getBlockScheme().roles).toEqual([]);
    });

    it('save → get round-trips and stores the canonical JSON in row 1', () => {
        const result = saveBlockScheme(SCHEME);
        expect(result.issues).toEqual([]);
        expect(result.scheme).toEqual(SCHEME);
        expect(getBlockScheme()).toEqual(SCHEME);

        const rows = storedRows();
        expect(rows).toHaveLength(1);
        expect(rows[0][0]).toBe(BLOCK_SCHEME_ROW_ID);
        expect(rows[0][1]).toBe(JSON.stringify(SCHEME));
    });

    it('a second save overwrites the single row (UPSERT)', () => {
        saveBlockScheme(SCHEME);
        saveBlockScheme({ ...SCHEME, enabled: false, templates: [] });
        expect(storedRows()).toHaveLength(1);
        expect(getBlockScheme()).toMatchObject({ enabled: false, templates: [] });
    });

    it('save is lenient: the CORRECTED document is stored and the corrections returned', () => {
        const raw = {
            ...SCHEME,
            extra: 'dropped',
            templates: [{ ...SCHEME.templates[0], slots: [{ roleId: 'C1', groupId: null, x: 0.5, y: 0, w: 0.9, h: 1 }] }],
        };
        const response = blockSchemeApi.save(raw);
        expect(response.success).toBe(true);
        const { issues, scheme } = response.data!;
        expect(issues.length).toBeGreaterThan(0);
        expect(issues.some(line => line.startsWith('extra'))).toBe(true);

        const stored = JSON.parse(storedRows()[0][1] as string);
        expect(stored).not.toHaveProperty('extra');
        expect(stored).toEqual(scheme);
        // The overflowing slot is clamped into the unit square; the missing V slot is synthesized.
        const slot = scheme.templates[0].slots.find(s => s.roleId === 'C1')!;
        expect(slot.x + slot.w).toBeLessThanOrEqual(1);
        expect(scheme.templates[0].slots).toHaveLength(2);
    });

    it('validate reports the same corrections without writing anything', () => {
        const response = blockSchemeApi.validate({ version: 1, enabled: 'yes' });
        expect(response.success).toBe(true);
        expect(response.data!.issues).toEqual(['enabled: expected a boolean (defaulted to false)']);
        expect(storedRows()).toEqual([]);
    });

    it('the API is registered on the unified etymologApi', () => {
        expect(etymologApi.blockScheme).toBe(blockSchemeApi);
    });

    it('a stored row that is not valid JSON reads as the default scheme and is logged', () => {
        const warn = vi.spyOn(dbLog, 'warn').mockImplementation(() => {});
        writeRawRow('{not json');
        expect(getBlockScheme()).toEqual(EMPTY_BLOCK_SCHEME);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0][1])).toMatch(/not valid JSON/);
        expect(blockSchemeApi.get().success).toBe(true);
    });

    it('a stored row with validation issues reads as the corrected scheme and is logged', () => {
        const warn = vi.spyOn(dbLog, 'warn').mockImplementation(() => {});
        writeRawRow(JSON.stringify({ ...SCHEME, templates: [{ ...SCHEME.templates[0], pattern: ['C1', 'NOPE'] }] }));
        const scheme = getBlockScheme();
        expect(scheme.enabled).toBe(true);
        expect(scheme.roles).toEqual(SCHEME.roles);
        expect(scheme.templates[0].pattern).toEqual(['C1']);
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('a stored row that is valid JSON but not an object reads as the default', () => {
        vi.spyOn(dbLog, 'warn').mockImplementation(() => {});
        writeRawRow('[1,2,3]');
        expect(getBlockScheme()).toEqual(EMPTY_BLOCK_SCHEME);
    });
});

describe('block scheme through JSON export / import', () => {
    beforeAll(async () => {
        await initDatabase();
    });
    beforeEach(() => {
        clearDatabase();
        localStorage.removeItem('etymolog_settings_v1');
        resetSettingsForTests();
    });

    it('export → import keeps the scheme', async () => {
        saveBlockScheme(SCHEME);
        const json = exportDataToJson(collectExportData());
        clearDatabase();
        expect(getBlockScheme()).toEqual(EMPTY_BLOCK_SCHEME);

        const report = await importExportData(parseAndValidateJson(json));
        expect(report.inserted.block_scheme).toBe(1);
        expect(report.warnings.filter(mentionsScheme)).toEqual([]);
        expect(getBlockScheme()).toEqual(SCHEME);
    });

    it('an envelope without a scheme imports as the default (no row)', async () => {
        const json = exportDataToJson(collectExportData());
        const report = await importExportData(parseAndValidateJson(json));
        expect(report.inserted.block_scheme).toBe(0);
        expect(storedRows()).toEqual([]);
        expect(getBlockScheme()).toEqual(EMPTY_BLOCK_SCHEME);
    });

    it('a corrupt definition in an envelope imports as the default with a report warning', async () => {
        const data = collectExportData();
        data.tables.block_scheme = [{ id: 1, definition: '{"version":1,"enabled":tru', updated_at: TS }];

        const report = await importExportData(parseAndValidateJson(exportDataToJson(data)));
        expect(report.inserted.block_scheme).toBe(1);
        expect(report.warnings.some(w => mentionsScheme(w) && /not valid JSON/.test(w))).toBe(true);
        expect(getBlockScheme()).toEqual(EMPTY_BLOCK_SCHEME);
        // Stored canonical, so the next read needs no correction.
        expect(storedRows()[0][1]).toBe(JSON.stringify(EMPTY_BLOCK_SCHEME));
    });

    it('a definition with fixable issues imports corrected, canonical, and warned', async () => {
        const data = collectExportData();
        data.tables.block_scheme = [{ id: 1, definition: JSON.stringify({ ...SCHEME, bogus: true }), updated_at: TS }];

        const report = await importExportData(parseAndValidateJson(exportDataToJson(data)));
        expect(report.warnings.some(w => /block scheme needed 1 correction/.test(w))).toBe(true);
        expect(getBlockScheme()).toEqual(SCHEME);
        expect(storedRows()[0][1]).toBe(JSON.stringify(SCHEME));
    });
});
