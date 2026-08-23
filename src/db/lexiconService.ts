/**
 * Lexicon Service
 *
 * CRUD operations for lexicon entries and their relationships to graphemes
 * (spelling) and to other entries (ancestry).
 *
 * ONE source of truth for spelling: `lexicon.glyph_order`, a JSON array of
 * entries — `"grapheme-<id>"` for a real grapheme, or a bare IPA character for
 * a fallback. `lexicon_spelling` is a DERIVED index (one row per grapheme
 * occurrence, `position` = index in `glyph_order`) kept in sync by
 * `syncLexiconSpellingFromGlyphOrder()` so "which words use grapheme X?" is a
 * join rather than a JSON scan. Every writer — `updateLexicon`,
 * `setLexiconSpelling`, `addSpellingToLexicon`, `clearLexiconSpelling` —
 * funnels through `glyph_order`; nothing writes the junction table directly.
 *
 * Every multi-statement write runs in `withTransaction()` (savepoint nesting,
 * one persist per outermost commit). Foreign keys are enforced on the
 * connection, so the explicit child deletes in `deleteLexicon` are belt-and-
 * braces rather than the only thing holding the data together.
 *
 * Rows are mapped by column NAME (`utils/sql.ts`); see `mapLexiconRecord`.
 */

import { getDatabase } from './database';
import { withTransaction } from './utils/transaction';
import { execRows, execOne, execScalar, lastInsertId, inPlaceholders, type SqlRecord } from './utils/sql';
import { validateStringLength, LIMITS } from './utils/sanitize';
import {
    serializeGlyphOrder,
    deserializeGlyphOrder,
    parseGlyphOrder,
    createGraphemeEntry,
    type SpellingEntry,
} from './utils/spellingUtils';
import type {
    Lexicon,
    CreateLexiconInput,
    UpdateLexiconInput,
    LexiconSpelling,
    LexiconAncestry,
    LexiconWithSpelling,
    LexiconWithAncestry,
    LexiconWithDescendants,
    LexiconComplete,
    LexiconAncestorEntry,
    LexiconDescendantEntry,
    LexiconAncestryNode,
    LexiconWithUsage,
    Grapheme,
    CreateLexiconSpellingInput,
    CreateLexiconAncestryInput,
    AncestryType,
    SpellingDisplayEntry,
    LexiconMeaning,
    CreateLexiconMeaningInput,
} from './types';
import {
    addClosurePaths,
    rebuildClosureTable,
    wouldCreateCycleClosure,
    getAllDescendantIdsClosure,
    getAllAncestorIdsClosure,
} from './closureService';

// =============================================================================
// ROW MAPPING
// =============================================================================

/** Column list for a lexicon row; `alias` lets it sit in a JOIN. */
function lexiconColumns(alias = ''): string {
    const p = alias ? `${alias}.` : '';
    return [
        'id', 'lemma', 'pronunciation', 'is_native', 'auto_spell', 'meaning',
        'part_of_speech', 'notes', 'glyph_order', 'needs_attention', 'created_at', 'updated_at',
    ].map(c => `${p}${c}`).join(', ');
}

function mapLexiconRecord(rec: SqlRecord): Lexicon {
    return {
        id: rec.id as number,
        lemma: rec.lemma as string,
        pronunciation: (rec.pronunciation as string | null) ?? null,
        is_native: rec.is_native === 1,
        auto_spell: rec.auto_spell === 1,
        meaning: (rec.meaning as string | null) ?? null,
        part_of_speech: (rec.part_of_speech as string | null) ?? null,
        notes: (rec.notes as string | null) ?? null,
        glyph_order: (rec.glyph_order as string | null) ?? '[]',
        needs_attention: rec.needs_attention === 1,
        created_at: rec.created_at as string,
        updated_at: rec.updated_at as string,
    };
}

function mapGraphemeRecord(rec: SqlRecord): Grapheme {
    return {
        id: rec.id as number,
        name: rec.name as string,
        category: (rec.category as string | null) ?? null,
        notes: (rec.notes as string | null) ?? null,
        created_at: rec.created_at as string,
        updated_at: rec.updated_at as string,
    };
}

function mapMeaningRecord(rec: SqlRecord): LexiconMeaning {
    return {
        id: rec.id as number,
        lexicon_id: rec.lexicon_id as number,
        meaning: rec.meaning as string,
        part_of_speech: (rec.part_of_speech as string | null) ?? null,
        usage_notes: (rec.usage_notes as string | null) ?? null,
        definition_order: rec.definition_order as number,
    };
}

const LEXICON_ORDER = 'needs_attention DESC, COALESCE(pronunciation, lemma) ASC';

// =============================================================================
// LEXICON CRUD OPERATIONS
// =============================================================================

function getMeaningsForLexicon(lexiconId: number): LexiconMeaning[] {
    return execRows(
        getDatabase(),
        `SELECT id, lexicon_id, meaning, part_of_speech, usage_notes, definition_order
         FROM lexicon_meanings WHERE lexicon_id = ? ORDER BY definition_order ASC`,
        [lexiconId],
    ).map(mapMeaningRecord);
}

function insertMeanings(lexiconId: number, meanings: CreateLexiconMeaningInput[]): void {
    const db = getDatabase();
    meanings.forEach((meaning, i) => {
        db.run(
            `INSERT INTO lexicon_meanings (lexicon_id, meaning, part_of_speech, usage_notes, definition_order)
             VALUES (?, ?, ?, ?, ?)`,
            [
                lexiconId,
                meaning.meaning,
                meaning.part_of_speech ?? null,
                meaning.usage_notes ?? null,
                meaning.definition_order ?? i,
            ],
        );
    });
}

/**
 * Create a new lexicon entry with optional spelling, meanings and ancestry.
 * Accepts either `glyph_order` (canonical) or legacy `spelling` rows, which
 * are converted to `glyph_order` on the way in.
 */
export function createLexicon(input: CreateLexiconInput): LexiconComplete {
    const db = getDatabase();

    if (input.lemma) validateStringLength(input.lemma, LIMITS.LEMMA, 'Lemma');
    if (input.pronunciation) validateStringLength(input.pronunciation, LIMITS.PRONUNCIATION, 'Pronunciation');
    if (input.meaning) validateStringLength(input.meaning, LIMITS.MEANING, 'Meaning');
    if (input.notes) validateStringLength(input.notes, LIMITS.NOTES, 'Notes');
    if (input.part_of_speech) validateStringLength(input.part_of_speech, LIMITS.PART_OF_SPEECH, 'Part of speech');

    let glyphOrder: SpellingEntry[] = [];
    if (input.glyph_order && input.glyph_order.length > 0) {
        glyphOrder = input.glyph_order;
    } else if (input.spelling && input.spelling.length > 0) {
        glyphOrder = [...input.spelling]
            .sort((a, b) => a.position - b.position)
            .map(s => createGraphemeEntry(s.grapheme_id));
    }

    let meanings: CreateLexiconMeaningInput[] = [];
    if (input.meanings && input.meanings.length > 0) {
        meanings = input.meanings;
    } else if (input.meaning && input.meaning.trim()) {
        meanings = [{ meaning: input.meaning }];
    }
    const primaryMeaning = meanings.length > 0 ? meanings[0].meaning : null;

    const lexiconId = withTransaction(db, () => {
        db.run(
            `INSERT INTO lexicon (lemma, pronunciation, is_native, auto_spell, meaning, part_of_speech, notes, glyph_order, needs_attention)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
            [
                input.lemma ?? null,
                input.pronunciation ?? null,
                input.is_native !== false ? 1 : 0,
                input.auto_spell !== false ? 1 : 0,
                primaryMeaning,
                input.part_of_speech ?? null,
                input.notes ?? null,
                serializeGlyphOrder(glyphOrder),
            ],
        );
        const id = lastInsertId(db);
        syncLexiconSpellingFromGlyphOrder(id, glyphOrder);
        insertMeanings(id, meanings);
        for (const ancestryInput of input.ancestry ?? []) {
            addAncestorToLexicon(id, ancestryInput);
        }
        return id;
    });

    const lexicon = getLexiconComplete(lexiconId);
    if (!lexicon) {
        throw new Error('Failed to create lexicon entry');
    }
    return lexicon;
}

/** Get a lexicon entry by ID (without spelling or ancestry). */
export function getLexiconById(id: number): Lexicon | null {
    const rec = execOne(getDatabase(), `SELECT ${lexiconColumns()} FROM lexicon WHERE id = ?`, [id]);
    return rec ? mapLexiconRecord(rec) : null;
}

export function getLexiconWithSpelling(id: number): LexiconWithSpelling | null {
    const lexicon = getLexiconById(id);
    if (!lexicon) return null;
    return { ...lexicon, spelling: getSpellingByLexiconId(id) };
}

export function getLexiconWithAncestry(id: number): LexiconWithAncestry | null {
    const lexicon = getLexiconById(id);
    if (!lexicon) return null;
    return { ...lexicon, ancestors: getAncestorsByLexiconId(id) };
}

export function getLexiconWithDescendants(id: number): LexiconWithDescendants | null {
    const lexicon = getLexiconById(id);
    if (!lexicon) return null;
    return { ...lexicon, descendants: getDescendantsByLexiconId(id) };
}

/** Graphemes-only projection of a spelling display (legacy `spelling` field). */
function graphemesOf(display: SpellingDisplayEntry[]): Grapheme[] {
    return display.filter(e => e.type === 'grapheme' && e.grapheme).map(e => e.grapheme!);
}

/**
 * Get a lexicon entry with spelling, ancestors, descendants and meanings.
 */
export function getLexiconComplete(id: number): LexiconComplete | null {
    const lexicon = getLexiconById(id);
    if (!lexicon) return null;

    const { entries: spellingDisplay, hasIpaFallbacks } = buildSpellingDisplay(lexicon.glyph_order);
    return {
        ...lexicon,
        spellingDisplay,
        spelling: graphemesOf(spellingDisplay),
        ancestors: getAncestorsByLexiconId(id),
        descendants: getDescendantsByLexiconId(id),
        hasIpaFallbacks,
        meanings: getMeaningsForLexicon(id),
    };
}

/** Get all lexicon entries (without related data). */
export function getAllLexicon(): Lexicon[] {
    return execRows(getDatabase(), `SELECT ${lexiconColumns()} FROM lexicon ORDER BY ${LEXICON_ORDER}`)
        .map(mapLexiconRecord);
}

export function getAllLexiconWithSpelling(): LexiconWithSpelling[] {
    return getAllLexicon().map(entry => ({ ...entry, spelling: getSpellingByLexiconId(entry.id) }));
}

/**
 * Get all lexicon entries with full data — FOUR statements total regardless
 * of lexicon size (entries, graphemes, ancestry edges, meanings), grouped in
 * JS. Entries needing attention sort to the top.
 */
export function getAllLexiconComplete(): LexiconComplete[] {
    const db = getDatabase();
    const entries = getAllLexicon();
    if (entries.length === 0) return [];

    const byId = new Map(entries.map(e => [e.id, e]));
    const graphemeIndex = loadGraphemeIndex();

    const ancestorsOf = new Map<number, LexiconAncestorEntry[]>();
    const descendantsOf = new Map<number, LexiconDescendantEntry[]>();
    for (const edge of execRows(db, `SELECT lexicon_id, ancestor_id, position, ancestry_type FROM lexicon_ancestry ORDER BY position ASC`)) {
        const childId = edge.lexicon_id as number;
        const parentId = edge.ancestor_id as number;
        const parent = byId.get(parentId);
        const child = byId.get(childId);
        const type = edge.ancestry_type as AncestryType;
        if (parent) {
            if (!ancestorsOf.has(childId)) ancestorsOf.set(childId, []);
            ancestorsOf.get(childId)!.push({ ancestor: parent, position: edge.position as number, ancestry_type: type });
        }
        if (child) {
            if (!descendantsOf.has(parentId)) descendantsOf.set(parentId, []);
            descendantsOf.get(parentId)!.push({ descendant: child, ancestry_type: type });
        }
    }
    for (const list of descendantsOf.values()) {
        list.sort((a, b) => sortKey(a.descendant).localeCompare(sortKey(b.descendant)));
    }

    const meaningsOf = new Map<number, LexiconMeaning[]>();
    for (const rec of execRows(db, `SELECT id, lexicon_id, meaning, part_of_speech, usage_notes, definition_order FROM lexicon_meanings ORDER BY definition_order ASC`)) {
        const m = mapMeaningRecord(rec);
        if (!meaningsOf.has(m.lexicon_id)) meaningsOf.set(m.lexicon_id, []);
        meaningsOf.get(m.lexicon_id)!.push(m);
    }

    return entries.map(entry => {
        const { entries: spellingDisplay, hasIpaFallbacks } = buildSpellingDisplay(entry.glyph_order, graphemeIndex);
        return {
            ...entry,
            spellingDisplay,
            spelling: graphemesOf(spellingDisplay),
            ancestors: ancestorsOf.get(entry.id) ?? [],
            descendants: descendantsOf.get(entry.id) ?? [],
            meanings: meaningsOf.get(entry.id) ?? [],
            hasIpaFallbacks,
        };
    });
}

function sortKey(l: Lexicon): string {
    return l.pronunciation ?? l.lemma;
}

/** Get all lexicon entries with descendant counts. */
export function getAllLexiconWithUsage(): LexiconWithUsage[] {
    const db = getDatabase();
    const meaningsOf = new Map<number, LexiconMeaning[]>();
    for (const rec of execRows(db, `SELECT id, lexicon_id, meaning, part_of_speech, usage_notes, definition_order FROM lexicon_meanings ORDER BY definition_order ASC`)) {
        const m = mapMeaningRecord(rec);
        if (!meaningsOf.has(m.lexicon_id)) meaningsOf.set(m.lexicon_id, []);
        meaningsOf.get(m.lexicon_id)!.push(m);
    }
    return execRows(db, `
        SELECT ${lexiconColumns('l')}, COUNT(la.id) AS descendant_count
        FROM lexicon l
        LEFT JOIN lexicon_ancestry la ON l.id = la.ancestor_id
        GROUP BY l.id
        ORDER BY l.needs_attention DESC, COALESCE(l.pronunciation, l.lemma) ASC
    `).map(rec => ({
        ...mapLexiconRecord(rec),
        descendantCount: rec.descendant_count as number,
        meanings: meaningsOf.get(rec.id as number) ?? [],
    }));
}

/** Search by lemma, pronunciation, or any meaning. */
export function searchLexicon(query: string): Lexicon[] {
    const like = `%${query}%`;
    return execRows(getDatabase(), `
        SELECT DISTINCT ${lexiconColumns('l')}
        FROM lexicon l
        LEFT JOIN lexicon_meanings lm ON l.id = lm.lexicon_id
        WHERE l.pronunciation LIKE ? OR l.meaning LIKE ? OR l.lemma LIKE ? OR lm.meaning LIKE ?
        ORDER BY l.needs_attention DESC, COALESCE(l.pronunciation, l.lemma) ASC
    `, [like, like, like, like]).map(mapLexiconRecord);
}

export function getLexiconByNative(isNative: boolean): Lexicon[] {
    return execRows(
        getDatabase(),
        `SELECT ${lexiconColumns()} FROM lexicon WHERE is_native = ? ORDER BY ${LEXICON_ORDER}`,
        [isNative ? 1 : 0],
    ).map(mapLexiconRecord);
}

/** Patterns per statement — well under SQLite's bind-parameter ceiling. */
const MENTION_PATTERN_CHUNK = 200;

/**
 * Auto-spelled words whose pronunciation CONTAINS any of `patterns` — the
 * candidate set for a respell after a phoneme changes.
 *
 * A phoneme can only change how a word is spelled if that phoneme's text
 * occurs somewhere in the word's pronunciation (the speller matches phonemes
 * as literal substrings of it, see `autoSpellService`). So rather than running
 * the DP over the whole lexicon after every script edit, this narrows it to
 * the words that can possibly be affected with one substring scan — `instr()`,
 * not `LIKE`, so a `%` or `_` inside a phoneme needs no escaping. Words without
 * a pronunciation have nothing to respell from and are never candidates.
 *
 * Matching is exact and case-sensitive on the RAW stored strings, which is
 * precisely the comparison the speller itself makes.
 */
export function getAutoSpelledLexiconMentioning(patterns: string[]): Lexicon[] {
    const distinct = [...new Set(patterns.filter(p => p.length > 0))];
    if (distinct.length === 0) return [];

    const db = getDatabase();
    const byId = new Map<number, Lexicon>();
    for (let i = 0; i < distinct.length; i += MENTION_PATTERN_CHUNK) {
        const chunk = distinct.slice(i, i + MENTION_PATTERN_CHUNK);
        const mentions = chunk.map(() => 'instr(pronunciation, ?) > 0').join(' OR ');
        for (const rec of execRows(db, `
            SELECT ${lexiconColumns()} FROM lexicon
            WHERE auto_spell = 1
              AND pronunciation IS NOT NULL AND pronunciation <> ''
              AND (${mentions})
        `, chunk)) {
            const row = mapLexiconRecord(rec);
            byId.set(row.id, row);
        }
    }
    return [...byId.values()].sort((a, b) => a.id - b.id);
}

/**
 * Update a lexicon entry. Providing `glyph_order` resyncs the spelling index;
 * providing `meanings` replaces the meanings table rows.
 */
export function updateLexicon(id: number, input: UpdateLexiconInput): Lexicon | null {
    const db = getDatabase();

    if (input.lemma) validateStringLength(input.lemma, LIMITS.LEMMA, 'Lemma');
    if (input.pronunciation) validateStringLength(input.pronunciation, LIMITS.PRONUNCIATION, 'Pronunciation');
    if (input.meaning) validateStringLength(input.meaning, LIMITS.MEANING, 'Meaning');
    if (input.notes) validateStringLength(input.notes, LIMITS.NOTES, 'Notes');
    if (input.part_of_speech) validateStringLength(input.part_of_speech, LIMITS.PART_OF_SPEECH, 'Part of speech');

    const updates: string[] = [];
    const values: (string | number | null)[] = [];
    const set = (column: string, value: string | number | null) => {
        updates.push(`${column} = ?`);
        values.push(value);
    };

    if (input.lemma !== undefined) set('lemma', input.lemma);
    if (input.pronunciation !== undefined) set('pronunciation', input.pronunciation);
    if (input.is_native !== undefined) set('is_native', input.is_native ? 1 : 0);
    if (input.auto_spell !== undefined) set('auto_spell', input.auto_spell ? 1 : 0);

    if (input.meanings !== undefined) {
        set('meaning', input.meanings.length > 0 ? input.meanings[0].meaning : null);
    } else if (input.meaning !== undefined) {
        set('meaning', input.meaning);
    }

    if (input.part_of_speech !== undefined) set('part_of_speech', input.part_of_speech);
    if (input.notes !== undefined) set('notes', input.notes);
    if (input.glyph_order !== undefined) set('glyph_order', serializeGlyphOrder(input.glyph_order));
    if (input.needs_attention !== undefined) set('needs_attention', input.needs_attention ? 1 : 0);

    if (updates.length === 0 && input.meanings === undefined) {
        return getLexiconById(id);
    }

    withTransaction(db, () => {
        if (updates.length > 0) {
            updates.push("updated_at = datetime('now')");
            db.run(`UPDATE lexicon SET ${updates.join(', ')} WHERE id = ?`, [...values, id]);
        }
        if (input.glyph_order !== undefined) {
            syncLexiconSpellingFromGlyphOrder(id, input.glyph_order);
        }
        if (input.meanings !== undefined) {
            db.run('DELETE FROM lexicon_meanings WHERE lexicon_id = ?', [id]);
            insertMeanings(id, input.meanings);
        }
    });

    return getLexiconById(id);
}

/**
 * Delete a lexicon entry. Removes its spelling index, meanings and ancestry
 * edges in both directions, then rebuilds the closure so no transitive path
 * through the deleted word survives.
 */
export function deleteLexicon(id: number): boolean {
    const db = getDatabase();
    if (!getLexiconById(id)) {
        throw new Error(`Lexicon entry with id ${id} not found`);
    }
    return withTransaction(db, () => {
        db.run('DELETE FROM lexicon_spelling WHERE lexicon_id = ?', [id]);
        db.run('DELETE FROM lexicon_meanings WHERE lexicon_id = ?', [id]);
        db.run('DELETE FROM lexicon_ancestry WHERE lexicon_id = ? OR ancestor_id = ?', [id, id]);
        db.run('DELETE FROM lexicon WHERE id = ?', [id]);
        const changes = db.getRowsModified();
        rebuildClosureTable(db);
        return changes > 0;
    });
}

export function getLexiconCount(): number {
    return execScalar<number>(getDatabase(), 'SELECT COUNT(*) FROM lexicon') ?? 0;
}

// =============================================================================
// LEXICON SPELLING OPERATIONS
// =============================================================================

/**
 * Graphemes of a word's spelling in order (one entry per occurrence, IPA
 * fallbacks excluded). Read from the derived index.
 */
export function getSpellingByLexiconId(lexiconId: number): Grapheme[] {
    return execRows(getDatabase(), `
        SELECT g.id, g.name, g.category, g.notes, g.created_at, g.updated_at
        FROM graphemes g
        JOIN lexicon_spelling ls ON g.id = ls.grapheme_id
        WHERE ls.lexicon_id = ?
        ORDER BY ls.position ASC
    `, [lexiconId]).map(mapGraphemeRecord);
}

/** Raw rows of the spelling index. */
export function getLexiconSpellingEntries(lexiconId: number): LexiconSpelling[] {
    return execRows(getDatabase(), `
        SELECT id, lexicon_id, grapheme_id, position
        FROM lexicon_spelling WHERE lexicon_id = ? ORDER BY position ASC
    `, [lexiconId]).map(rec => ({
        id: rec.id as number,
        lexicon_id: rec.lexicon_id as number,
        grapheme_id: rec.grapheme_id as number,
        position: rec.position as number,
    }));
}

function requireLexicon(id: number): Lexicon {
    const lexicon = getLexiconById(id);
    if (!lexicon) {
        throw new Error(`Lexicon entry with id ${id} not found`);
    }
    return lexicon;
}

/**
 * Insert a grapheme into a word's spelling at `position` (clamped to the
 * current length). Writes `glyph_order`; the index follows.
 */
export function addSpellingToLexicon(lexiconId: number, input: CreateLexiconSpellingInput): LexiconSpelling {
    const db = getDatabase();
    return withTransaction(db, () => {
        const current = deserializeGlyphOrder(requireLexicon(lexiconId).glyph_order);
        const at = Math.max(0, Math.min(input.position, current.length));
        current.splice(at, 0, createGraphemeEntry(input.grapheme_id));
        updateLexicon(lexiconId, { glyph_order: current });
        const row = execOne(
            db,
            'SELECT id, lexicon_id, grapheme_id, position FROM lexicon_spelling WHERE lexicon_id = ? AND position = ?',
            [lexiconId, at],
        );
        if (!row) {
            throw new Error('Spelling index out of sync after insert');
        }
        return {
            id: row.id as number,
            lexicon_id: row.lexicon_id as number,
            grapheme_id: row.grapheme_id as number,
            position: row.position as number,
        };
    });
}

/**
 * Replace a word's spelling with the given grapheme rows (sorted by position).
 * Any IPA fallbacks in the current spelling are dropped — the caller is
 * stating the full new spelling.
 */
export function setLexiconSpelling(lexiconId: number, spelling: CreateLexiconSpellingInput[]): void {
    requireLexicon(lexiconId);
    const glyphOrder = [...spelling]
        .sort((a, b) => a.position - b.position)
        .map(s => createGraphemeEntry(s.grapheme_id));
    updateLexicon(lexiconId, { glyph_order: glyphOrder });
}

/** Remove the entire spelling. Returns the number of index rows that existed. */
export function clearLexiconSpelling(lexiconId: number): number {
    const db = getDatabase();
    return withTransaction(db, () => {
        const before = execScalar<number>(db, 'SELECT COUNT(*) FROM lexicon_spelling WHERE lexicon_id = ?', [lexiconId]) ?? 0;
        updateLexicon(lexiconId, { glyph_order: [] });
        return before;
    });
}

// =============================================================================
// LEXICON ANCESTRY OPERATIONS
// =============================================================================

/** Direct ancestors of a word, in compound position order. */
export function getAncestorsByLexiconId(lexiconId: number): LexiconAncestorEntry[] {
    return execRows(getDatabase(), `
        SELECT ${lexiconColumns('l')}, la.position AS ancestry_position, la.ancestry_type
        FROM lexicon l
        JOIN lexicon_ancestry la ON l.id = la.ancestor_id
        WHERE la.lexicon_id = ?
        ORDER BY la.position ASC
    `, [lexiconId]).map(rec => ({
        ancestor: mapLexiconRecord(rec),
        position: rec.ancestry_position as number,
        ancestry_type: rec.ancestry_type as AncestryType,
    }));
}

/** Words derived directly from this word. */
export function getDescendantsByLexiconId(ancestorId: number): LexiconDescendantEntry[] {
    return execRows(getDatabase(), `
        SELECT ${lexiconColumns('l')}, la.ancestry_type
        FROM lexicon l
        JOIN lexicon_ancestry la ON l.id = la.lexicon_id
        WHERE la.ancestor_id = ?
        ORDER BY COALESCE(l.pronunciation, l.lemma) ASC
    `, [ancestorId]).map(rec => ({
        descendant: mapLexiconRecord(rec),
        ancestry_type: rec.ancestry_type as AncestryType,
    }));
}

/** Raw rows of the ancestry junction for a word. */
export function getLexiconAncestryEntries(lexiconId: number): LexiconAncestry[] {
    return execRows(getDatabase(), `
        SELECT id, lexicon_id, ancestor_id, position, ancestry_type
        FROM lexicon_ancestry WHERE lexicon_id = ? ORDER BY position ASC
    `, [lexiconId]).map(rec => ({
        id: rec.id as number,
        lexicon_id: rec.lexicon_id as number,
        ancestor_id: rec.ancestor_id as number,
        position: rec.position as number,
        ancestry_type: rec.ancestry_type as AncestryType,
    }));
}

function touchLexicon(lexiconId: number): void {
    getDatabase().run(`UPDATE lexicon SET updated_at = datetime('now') WHERE id = ?`, [lexiconId]);
}

/** Throws if the closure contains any self-path — the signature of a cycle. */
function assertClosureAcyclic(): void {
    const self = execScalar<number>(
        getDatabase(),
        'SELECT 1 FROM lexicon_ancestry_closure WHERE ancestor_id = descendant_id LIMIT 1',
    );
    if (self !== undefined) {
        throw new Error('Ancestry change would create a cycle in the etymology tree');
    }
}

/** Add one ancestor edge. Rejects cycles before writing. */
export function addAncestorToLexicon(lexiconId: number, input: CreateLexiconAncestryInput): LexiconAncestry {
    if (wouldCreateCycleClosure(lexiconId, input.ancestor_id)) {
        throw new Error(`Cannot add ancestor: would create a cycle (lexicon ${lexiconId} is an ancestor of ${input.ancestor_id})`);
    }
    const db = getDatabase();
    const type = input.ancestry_type ?? 'derived';
    return withTransaction(db, () => {
        db.run(
            `INSERT INTO lexicon_ancestry (lexicon_id, ancestor_id, position, ancestry_type) VALUES (?, ?, ?, ?)`,
            [lexiconId, input.ancestor_id, input.position, type],
        );
        const id = lastInsertId(db);
        touchLexicon(lexiconId);
        addClosurePaths(lexiconId, input.ancestor_id, db);
        return { id, lexicon_id: lexiconId, ancestor_id: input.ancestor_id, position: input.position, ancestry_type: type };
    });
}

/**
 * Replace a word's ancestry. Each new ancestor is cycle-checked against the
 * current graph (a word's own outgoing edges never lie on a path from its
 * would-be ancestor, so replacing them does not change the answer), the
 * closure is rebuilt, and a self-path assertion guards the result.
 */
export function setLexiconAncestry(lexiconId: number, ancestry: CreateLexiconAncestryInput[]): void {
    for (const input of ancestry) {
        if (wouldCreateCycleClosure(lexiconId, input.ancestor_id)) {
            throw new Error(`Cannot set ancestry: ancestor ${input.ancestor_id} would create a cycle`);
        }
    }
    const db = getDatabase();
    withTransaction(db, () => {
        db.run('DELETE FROM lexicon_ancestry WHERE lexicon_id = ?', [lexiconId]);
        for (const input of ancestry) {
            db.run(
                `INSERT INTO lexicon_ancestry (lexicon_id, ancestor_id, position, ancestry_type) VALUES (?, ?, ?, ?)`,
                [lexiconId, input.ancestor_id, input.position, input.ancestry_type ?? 'derived'],
            );
        }
        touchLexicon(lexiconId);
        rebuildClosureTable(db);
        assertClosureAcyclic();
    });
}

/** Remove one ancestor edge. */
export function removeAncestorFromLexicon(lexiconId: number, ancestorId: number): boolean {
    const db = getDatabase();
    return withTransaction(db, () => {
        db.run('DELETE FROM lexicon_ancestry WHERE lexicon_id = ? AND ancestor_id = ?', [lexiconId, ancestorId]);
        const changes = db.getRowsModified();
        if (changes > 0) {
            touchLexicon(lexiconId);
            rebuildClosureTable(db);
        }
        return changes > 0;
    });
}

/** Remove all ancestry for a word. */
export function clearLexiconAncestry(lexiconId: number): number {
    const db = getDatabase();
    return withTransaction(db, () => {
        db.run('DELETE FROM lexicon_ancestry WHERE lexicon_id = ?', [lexiconId]);
        const changes = db.getRowsModified();
        if (changes > 0) {
            touchLexicon(lexiconId);
            rebuildClosureTable(db);
        }
        return changes;
    });
}

// =============================================================================
// RECURSIVE ANCESTRY QUERIES
// =============================================================================

/**
 * Full ancestry tree. The visited set is PER PATH, so a diamond (two parents
 * sharing a grandparent) renders the grandparent under both branches; a node
 * cut by `maxDepth` or by a (should-be-impossible) cycle is marked
 * `truncated` instead of masquerading as a root.
 */
export function getFullAncestryTree(id: number, maxDepth: number = 50): LexiconAncestryNode {
    const root = getLexiconById(id);
    if (!root) {
        throw new Error(`Lexicon entry with id ${id} not found`);
    }

    function buildNode(
        entry: Lexicon,
        ancestryType: AncestryType | null,
        position: number | null,
        depth: number,
        path: Set<number>,
    ): LexiconAncestryNode {
        if (depth >= maxDepth) {
            return { entry, ancestry_type: ancestryType, position, ancestors: [], truncated: true };
        }
        const nextPath = new Set(path).add(entry.id);
        const ancestors = getAncestorsByLexiconId(entry.id).map(ae => {
            if (nextPath.has(ae.ancestor.id)) {
                return { entry: ae.ancestor, ancestry_type: ae.ancestry_type, position: ae.position, ancestors: [], truncated: true };
            }
            return buildNode(ae.ancestor, ae.ancestry_type, ae.position, depth + 1, nextPath);
        });
        return { entry, ancestry_type: ancestryType, position, ancestors };
    }

    return buildNode(root, null, null, 0, new Set());
}

/** All transitive ancestor ids (optionally only those within `maxDepth` edges). */
export function getAllAncestorIds(id: number, maxDepth?: number): number[] {
    return getAllAncestorIdsClosure(id, maxDepth);
}

/** All transitive descendant ids (optionally only those within `maxDepth` edges). */
export function getAllDescendantIds(id: number, maxDepth?: number): number[] {
    return getAllDescendantIdsClosure(id, maxDepth);
}

/**
 * Would making `ancestorId` an ancestor of `lexiconId` create a cycle?
 * True when they are the same word or `lexiconId` already sits above
 * `ancestorId` in the tree.
 */
export function wouldCreateCycle(lexiconId: number, ancestorId: number): boolean {
    return wouldCreateCycleClosure(lexiconId, ancestorId);
}

// =============================================================================
// SPELLING INDEX + DISPLAY
// =============================================================================

/**
 * Rebuild the `lexicon_spelling` index for one word from its `glyph_order`:
 * one row per grapheme OCCURRENCE, `position` = index in `glyph_order` (so
 * it lines up with `SpellingDisplayEntry.position`). Runs inside the caller's
 * transaction; a constraint failure propagates and rolls everything back.
 */
export function syncLexiconSpellingFromGlyphOrder(lexiconId: number, glyphOrder: SpellingEntry[]): void {
    const db = getDatabase();
    db.run('DELETE FROM lexicon_spelling WHERE lexicon_id = ?', [lexiconId]);
    parseGlyphOrder(glyphOrder).forEach((entry, index) => {
        if (entry.type === 'grapheme' && entry.graphemeId) {
            db.run(
                'INSERT INTO lexicon_spelling (lexicon_id, grapheme_id, position) VALUES (?, ?, ?)',
                [lexiconId, entry.graphemeId, index],
            );
        }
    });
}

/** Every grapheme, keyed by id — one statement. */
export function loadGraphemeIndex(ids?: number[]): Map<number, Grapheme> {
    const db = getDatabase();
    const rows = ids
        ? execRows(db, `SELECT id, name, category, notes, created_at, updated_at FROM graphemes WHERE id IN (${inPlaceholders(ids.length)})`, ids)
        : execRows(db, 'SELECT id, name, category, notes, created_at, updated_at FROM graphemes');
    return new Map(rows.map(rec => [rec.id as number, mapGraphemeRecord(rec)]));
}

/**
 * Resolve a `glyph_order` JSON string into display entries. Pass a prefetched
 * `graphemeIndex` when rendering many words; otherwise the graphemes this word
 * references are fetched with one `IN (...)` query.
 */
export function buildSpellingDisplay(
    glyphOrder: string,
    graphemeIndex?: Map<number, Grapheme>,
): { entries: SpellingDisplayEntry[]; hasIpaFallbacks: boolean } {
    const parsed = parseGlyphOrder(deserializeGlyphOrder(glyphOrder));
    const index = graphemeIndex ?? loadGraphemeIndex(
        [...new Set(parsed.filter(e => e.type === 'grapheme' && e.graphemeId).map(e => e.graphemeId!))],
    );

    const entries: SpellingDisplayEntry[] = [];
    let hasIpaFallbacks = false;
    parsed.forEach((entry, position) => {
        if (entry.type === 'grapheme' && entry.graphemeId) {
            const grapheme = index.get(entry.graphemeId);
            if (grapheme) {
                entries.push({ type: 'grapheme', position, grapheme });
            } else {
                // Grapheme no longer exists — surface a visible placeholder.
                entries.push({ type: 'ipa', position, ipaCharacter: `[?${entry.graphemeId}]` });
                hasIpaFallbacks = true;
            }
        } else if (entry.type === 'ipa' && entry.ipaCharacter) {
            entries.push({ type: 'ipa', position, ipaCharacter: entry.ipaCharacter });
            hasIpaFallbacks = true;
        }
    });

    return { entries, hasIpaFallbacks };
}

// =============================================================================
// GRAPHEME DELETION HANDLING
// =============================================================================

/** Words whose spelling uses a grapheme (via the derived index). */
export function getLexiconEntriesUsingGrapheme(graphemeId: number): Lexicon[] {
    return execRows(getDatabase(), `
        SELECT DISTINCT ${lexiconColumns('l')}
        FROM lexicon l
        JOIN lexicon_spelling ls ON l.id = ls.lexicon_id
        WHERE ls.grapheme_id = ?
        ORDER BY COALESCE(l.pronunciation, l.lemma) ASC
    `, [graphemeId]).map(mapLexiconRecord);
}

export interface GraphemeDeletionReport {
    /** Auto-spelled words rewritten with the fallback character. */
    respelledCount: number;
    /** Manually spelled (or already flagged) words flagged `needs_attention`. */
    markedForAttentionCount: number;
    /** Every word that was rewritten, in either category. */
    affectedLexiconIds: number[];
    /** The `respelledCount` words by id. */
    respelledLexiconIds: number[];
}

/**
 * Rewrite every word that uses `graphemeId` so the grapheme can be deleted:
 * each occurrence becomes the fallback IPA character. Auto-spelled words are
 * counted as respelled; manually spelled words are flagged `needs_attention`
 * for review. Runs in one transaction.
 *
 * This is the SUBSTITUTION step only. Once the grapheme (and its phonemes)
 * are gone, `respellAutoSpelledWords` (`respellService`) regenerates the
 * auto-spelled words that have a pronunciation from scratch, so a sound
 * another grapheme also covers is re-spelled with that grapheme rather than
 * left as a placeholder. The substitution still matters for auto-spelled
 * words WITHOUT a pronunciation, which have nothing to regenerate from.
 */
export function handleGraphemeDeletion(
    graphemeId: number,
    deletedGraphemePronunciation?: string,
): GraphemeDeletionReport {
    const db = getDatabase();
    return withTransaction(db, () => {
        const affected = getLexiconEntriesUsingGrapheme(graphemeId);
        const target = createGraphemeEntry(graphemeId);
        const fallback = deletedGraphemePronunciation || '?';
        const respelledLexiconIds: number[] = [];
        let markedForAttentionCount = 0;

        for (const entry of affected) {
            const glyphOrder = deserializeGlyphOrder(entry.glyph_order).map(e => (e === target ? fallback : e));
            // A manually spelled word needs review; a word that was ALREADY
            // flagged stays flagged — this is not the place to clear it.
            const needsAttention = !entry.auto_spell || entry.needs_attention;
            updateLexicon(entry.id, { glyph_order: glyphOrder, needs_attention: needsAttention });
            if (needsAttention) markedForAttentionCount++;
            else respelledLexiconIds.push(entry.id);
        }

        return {
            respelledCount: respelledLexiconIds.length,
            markedForAttentionCount,
            affectedLexiconIds: affected.map(e => e.id),
            respelledLexiconIds,
        };
    });
}

/** Words flagged for manual review. */
export function getLexiconEntriesNeedingAttention(): Lexicon[] {
    return execRows(
        getDatabase(),
        `SELECT ${lexiconColumns()} FROM lexicon WHERE needs_attention = 1 ORDER BY updated_at DESC`,
    ).map(mapLexiconRecord);
}

export function clearNeedsAttention(lexiconId: number): Lexicon | null {
    return updateLexicon(lexiconId, { needs_attention: false });
}

/** Set a word's spelling directly from a `glyph_order` array and clear the review flag. */
export function setLexiconGlyphOrder(lexiconId: number, glyphOrder: SpellingEntry[]): Lexicon | null {
    return updateLexicon(lexiconId, { glyph_order: glyphOrder, needs_attention: false });
}
