/**
 * BlockPreviewStrip — the word as every other renderer will draw it.
 *
 * Shown above the canvas tiles while the script's block scheme is on
 * (BLOCK_SCRIPT_PLAN Phase 6). The canvas stays entry-based — one tile per
 * spelling entry — so this strip is where the user sees the COMPOSED result:
 * blocks, slot variants, pins, boundaries. It is the real
 * `GlyphSpellingDisplay`, reading the scheme and the grapheme index from the
 * provider exactly as a card or the translator does (plan P7), so the two
 * can never disagree.
 *
 * Read-only; it stays visible under the auto-spell lock.
 *
 * @module glyphCanvasInput/BlockPreviewStrip
 */

'use client';

import { GlyphSpellingDisplay } from '../../../display/spelling';
import type { LayoutStrategyType } from '../../../display/spelling/types';
import type { SpellingDisplayEntry } from '../../../../db/types';
import type { WritingDirection } from './types';

import styles from './BlockPreviewStrip.module.scss';

export interface BlockPreviewStripProps {
    /** The canvas' current entries, 1:1 with its tiles. */
    entries: SpellingDisplayEntry[];
    /** The canvas' writing direction; `custom` previews left-to-right. */
    direction?: WritingDirection;
}

/** Module scope: a stable config identity for the display's memo. */
const PREVIEW_CONFIG = { glyphWidth: 40, glyphHeight: 40, spacing: 6, padding: 6 };

export default function BlockPreviewStrip({ entries, direction = 'ltr' }: BlockPreviewStripProps) {
    const strategy: LayoutStrategyType = direction === 'custom' ? 'ltr' : direction;
    return (
        <section className={styles.strip} aria-label="Block preview" data-testid="block-preview-strip">
            <p className={styles.caption}>This is how the word renders everywhere else</p>
            <div className={styles.display}>
                <GlyphSpellingDisplay
                    glyphs={entries}
                    strategy={strategy}
                    config={PREVIEW_CONFIG}
                    fit="shrink"
                    emptyContent={<span className={styles.empty}>Nothing to preview yet</span>}
                />
            </div>
        </section>
    );
}

export { BlockPreviewStrip };
