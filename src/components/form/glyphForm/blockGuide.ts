/**
 * Block guide — a template box drawn on the glyph canvas, so a sign meant for
 * one box of a block (a wide head form, a tall side form) can be drawn to that
 * box's shape.
 *
 * The canvas's guide square IS the block's square (both are the glyph cell,
 * `GLYPH_GUIDE_INSET`), so a template's unit-square layout maps onto it
 * directly: ink drawn to fill the highlighted box lands in the block filling
 * that box. (Composition crops a sign to its ink and fits it into the box, so
 * the SHAPE is what matters; where on the canvas it is drawn does not.)
 *
 * The chosen guide is remembered per device — drawing several variants for one
 * box in a row should not mean re-picking it every time.
 *
 * @module form/glyphForm/blockGuide
 */

import { useSyncExternalStore } from 'react';

import type { BlockScheme, BlockSlot, BlockTemplate } from '../../../blocks/types';

/** One pickable box: a template's slot. */
export interface BlockGuideOption {
    /** `templateId` + `roleId`, stable across renders. */
    key: string;
    template: BlockTemplate;
    slot: BlockSlot;
    /** The slot's role label, or its id when the role is gone. */
    roleLabel: string;
}

/** A role's colour (a CSS value) by role id, for painting a template's boxes. */
export function roleColours(scheme: BlockScheme | null): Map<string, string | undefined> {
    return new Map((scheme?.roles ?? []).map((role) => [role.id, role.colour]));
}

const KEY_SEPARATOR = '\u0000';

export function guideKey(templateId: string, roleId: string): string {
    return `${templateId}${KEY_SEPARATOR}${roleId}`;
}

/** Every template's boxes, in template then pattern order. */
export function blockGuideOptions(scheme: BlockScheme | null): BlockGuideOption[] {
    if (!scheme) return [];
    const labels = new Map(scheme.roles.map((role) => [role.id, role.label]));
    const options: BlockGuideOption[] = [];
    for (const template of scheme.templates) {
        for (const roleId of template.pattern) {
            const slot = template.slots.find((s) => s.roleId === roleId);
            if (!slot) continue;
            options.push({ key: guideKey(template.id, roleId), template, slot, roleLabel: labels.get(roleId) ?? roleId });
        }
    }
    return options;
}

/** `0.5` → `"50%"`, rounded to whole percent. */
function percent(value: number): string {
    return `${Math.round(value * 100)}%`;
}

/** "50% wide × 100% tall" — a box's size as a share of the block. */
export function describeBoxSize(slot: BlockSlot): string {
    return `${percent(slot.w)} wide × ${percent(slot.h)} tall`;
}

// ── remembered choice ──────────────────────────────────────────────────────

const STORAGE_KEY = 'etymolog:glyphBlockGuide';
const listeners = new Set<() => void>();

function read(): string | null {
    try {
        return window.localStorage.getItem(STORAGE_KEY);
    } catch {
        return null;
    }
}

let current: string | null = typeof window === 'undefined' ? null : read();

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/** `null` = no guide. */
export function setBlockGuideKey(key: string | null): void {
    current = key;
    try {
        if (key === null) window.localStorage.removeItem(STORAGE_KEY);
        else window.localStorage.setItem(STORAGE_KEY, key);
    } catch {
        // Storage blocked: the choice still holds for this session.
    }
    listeners.forEach((listener) => listener());
}

/** The remembered guide key (it may name a box that no longer exists — resolve it against the options). */
export function useBlockGuideKey(): string | null {
    return useSyncExternalStore(subscribe, () => current, () => null);
}
