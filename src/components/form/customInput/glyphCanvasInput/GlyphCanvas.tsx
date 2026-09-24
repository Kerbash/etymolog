/**
 * GlyphCanvas Component
 *
 * A pannable/zoomable canvas for displaying selected glyphs.
 * Uses PannableCanvas for consistent pan and zoom functionality.
 *
 * @module glyphCanvasInput/GlyphCanvas
 */

'use client';

import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { FocusEvent as ReactFocusEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { PannableCanvas } from 'cyber-components/interactable/canvas/pannableCanvas';
import type { PannableCanvasRef } from 'cyber-components/interactable/canvas/pannableCanvas';
import classNames from 'classnames';
import DOMPurify from 'dompurify';

import type { GlyphCanvasProps, GlyphCanvasRef, CanvasGlyph, CanvasBlockOutline, GlyphForCanvas } from './types';
import {
    calculateGlyphLayout,
    calculateBounds,
    isBoundaryGlyphName,
    isJoinGlyphName,
    isVirtualGlyphId,
    isWhitespaceGlyphName,
} from './utils';
import { GLYPH_GUIDE_INSET } from '../../../../db/utils/glyphMetrics';
import { caretLine, cursorMoveForKey, describeCursor, moveCursor } from './utils/canvasCursor';

import styles from './GlyphCanvas.module.scss';

/**
 * GlyphCanvas
 *
 * A display-only canvas that renders glyphs with pan and zoom support.
 * Glyphs are positioned based on the configured writing direction.
 *
 * @example
 * ```tsx
 * const canvasRef = useRef<GlyphCanvasRef>(null);
 *
 * <GlyphCanvas
 *   ref={canvasRef}
 *   selectedGlyphIds={[1, 2, 3]}
 *   glyphMap={glyphMap}
 *   layout={{ direction: 'ltr' }}
 * />
 *
 * // Later:
 * canvasRef.current?.fitToView();
 * ```
 */
const GlyphCanvas = forwardRef<GlyphCanvasRef, GlyphCanvasProps>(
    function GlyphCanvas(
        {
            selectedGlyphIds,
            glyphMap,
            layout = {},
            initialScale = 1,
            minScale = 0.25,
            maxScale = 3,
            showControls = true,
            emptyStateContent,
            className,
            style,
            minHeight = '120px',
            blocks,
            onOpenBlock,
            showBoundaries = false,
            pinnedIndices,
            glyphOverrides,
            cursor = null,
            onCursorMove,
            showCursor = false,
        },
        ref
    ) {
        const pannableRef = useRef<PannableCanvasRef>(null);
        const [focused, setFocused] = useState(false);
        // Where the last press started, to tell a tap on a tile from a pan.
        const pressRef = useRef<{ x: number; y: number } | null>(null);

        // Get glyphs from IDs. `sourceIndices[k]` is the SELECTION position of
        // layout item k: an id missing from the map is skipped, and the block
        // outlines / pin markers (which speak selection positions) must still
        // land on the right tiles.
        const { selectedGlyphs, sourceIndices } = useMemo(() => {
            const glyphs: GlyphForCanvas[] = [];
            const sources: number[] = [];
            selectedGlyphIds.forEach((id, index) => {
                const glyph = glyphOverrides?.get(index) ?? glyphMap.get(id);
                if (glyph === undefined) return;
                glyphs.push(glyph);
                sources.push(index);
            });
            return { selectedGlyphs: glyphs, sourceIndices: sources };
        }, [selectedGlyphIds, glyphMap, glyphOverrides]);

        // Calculate positioned glyphs
        const positionedGlyphs = useMemo(() => {
            return calculateGlyphLayout(selectedGlyphs, layout);
        }, [selectedGlyphs, layout]);

        // Calculate canvas bounds
        const bounds = useMemo(() => {
            return calculateBounds(positionedGlyphs, layout);
        }, [positionedGlyphs, layout]);

        // Block outlines, in canvas coordinates. A band above the tiles holds
        // their captions, so the content shifts down by it when any exist.
        const outlines = useMemo(
            () => layoutBlockOutlines(blocks, positionedGlyphs, sourceIndices),
            [blocks, positionedGlyphs, sourceIndices],
        );
        const captionBand = outlines.length > 0 ? BLOCK_CAPTION_BAND : 0;

        // The insertion point. Drawn while the canvas has focus (the arrows are
        // moving it) or the parent asks (the glyph keyboard is open, so the
        // next key lands there).
        const direction = layout.direction ?? 'ltr';
        const caret = useMemo(
            () => ((showCursor || focused) && onCursorMove ? caretLine(cursor, positionedGlyphs, sourceIndices, direction) : null),
            [showCursor, focused, onCursorMove, cursor, positionedGlyphs, sourceIndices, direction],
        );

        const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
            // Only keys pressed on the canvas itself: the block captions'
            // buttons inside it keep their own keys.
            if (!onCursorMove || event.target !== event.currentTarget) return;
            const move = cursorMoveForKey(event.key, direction);
            if (!move) return;
            event.preventDefault();
            onCursorMove(moveCursor(cursor, move, selectedGlyphIds.length));
        };

        // A TAP on a tile places the insertion point before it (its leading
        // half) or after it (its trailing half), in the writing direction. A
        // press that moved is a pan, not a tap.
        const handleTileClick = (event: ReactMouseEvent<HTMLDivElement>) => {
            if (!onCursorMove) return;
            const press = pressRef.current;
            pressRef.current = null;
            if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > TAP_SLOP_PX) return;
            const target = event.target as Element;
            if (target.closest('button, a, input, select, textarea')) return;
            const tile = target.closest<SVGGraphicsElement>('[data-tile-source]');
            if (!tile) return;
            const source = Number(tile.getAttribute('data-tile-source'));
            if (!Number.isInteger(source)) return;
            const box = tile.getBoundingClientRect();
            const vertical = direction === 'ttb' || direction === 'btt';
            const pastMiddle = vertical
                ? event.clientY > box.top + box.height / 2
                : event.clientX > box.left + box.width / 2;
            const reversed = direction === 'rtl' || direction === 'btt';
            const after = pastMiddle !== reversed;
            const next = after ? source + 1 : source;
            onCursorMove(next >= selectedGlyphIds.length ? null : next);
        };

        // SVG dimensions
        const svgWidth = Math.max(bounds.width, 200);
        const svgHeight = Math.max(bounds.height + captionBand, 80);

        // Expose imperative methods - delegate to PannableCanvas
        useImperativeHandle(ref, () => ({
            resetView: () => {
                pannableRef.current?.resetView();
            },
            fitToView: () => {
                pannableRef.current?.fitToView();
            },
        }), []);

        // Empty state
        if (selectedGlyphIds.length === 0) {
            return (
                <div
                    className={classNames(styles.canvasContainer, styles.empty, className)}
                    style={{ ...style, minHeight }}
                >
                    {emptyStateContent ?? (
                        <span className={styles.emptyText}>
                            No glyphs selected. Click the keyboard button to add glyphs.
                        </span>
                    )}
                </div>
            );
        }

        return (
            <div
                className={classNames(styles.canvasContainer, onCursorMove && styles.cursorEnabled, className)}
                style={{ ...style, minHeight }}
                {...(onCursorMove ? {
                    tabIndex: 0,
                    role: 'group',
                    'aria-label': `Spelling, ${selectedGlyphIds.length} glyphs. Arrow keys move the insertion point; Home and End jump to the start and end.`,
                    onKeyDown: handleKeyDown,
                    // The pannable surface prevents the default on pointerdown
                    // (it starts a pan), which also cancels the browser's
                    // focus-on-press — a clicked canvas would stay deaf to the
                    // arrows. Capture phase, so it runs before the pan; a press
                    // on a block caption's button leaves focus to the button.
                    onPointerDownCapture: (event: ReactPointerEvent<HTMLDivElement>) => {
                        pressRef.current = { x: event.clientX, y: event.clientY };
                        if ((event.target as Element).closest('button, a, input, select, textarea')) return;
                        event.currentTarget.focus({ preventScroll: true });
                    },
                    onClick: handleTileClick,
                    onFocus: (event: ReactFocusEvent<HTMLDivElement>) => { if (event.target === event.currentTarget) setFocused(true); },
                    onBlur: (event: ReactFocusEvent<HTMLDivElement>) => { if (event.target === event.currentTarget) setFocused(false); },
                } : {})}
            >
                {onCursorMove && (
                    <span className={styles.srOnly} aria-live="polite">
                        {focused ? describeCursor(cursor, selectedGlyphIds.length) : ''}
                    </span>
                )}
                <PannableCanvas
                    ref={pannableRef}
                    contentDimensions={{ width: svgWidth, height: svgHeight }}
                    initialScale={initialScale}
                    minScale={minScale}
                    maxScale={maxScale}
                    showControls={showControls}
                    centerOnInit
                    enableVelocity
                    className={styles.canvasInner}
                    ariaLabel={`Canvas with ${selectedGlyphIds.length} glyphs`}
                >
                    <svg
                        width={svgWidth}
                        height={svgHeight}
                        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                        className={styles.svg}
                        role="img"
                        aria-label={`Canvas with ${selectedGlyphIds.length} glyphs`}
                    >
                        {/* Two passes, cells first: boxes overlap by their
                            margins, so a background painted with its own
                            glyph would cover the previous letter's overhang. */}
                        <g transform={captionBand > 0 ? `translate(0, ${captionBand})` : undefined}>
                            {positionedGlyphs.map((pg) => (
                                <GlyphCell
                                    key={`cell-${pg.glyph.id}-${pg.index}`}
                                    positionedGlyph={pg}
                                    slim={showBoundaries ? slimTileOf(pg.glyph) : null}
                                />
                            ))}
                            {positionedGlyphs.map((pg) => (
                                <GlyphNode
                                    key={`${pg.glyph.id}-${pg.index}`}
                                    positionedGlyph={pg}
                                    source={sourceIndices[pg.index]}
                                    slim={showBoundaries ? slimTileOf(pg.glyph) : null}
                                    pinned={pinnedIndices?.has(sourceIndices[pg.index]) ?? false}
                                />
                            ))}
                            {outlines.map((outline) => (
                                <BlockOutline key={`block-${outline.block.key}`} outline={outline} onOpen={onOpenBlock} />
                            ))}
                            {caret && (
                                <line
                                    className={styles.caret}
                                    data-canvas-caret=""
                                    x1={caret.x1}
                                    y1={caret.y1}
                                    x2={caret.x2}
                                    y2={caret.y2}
                                />
                            )}
                        </g>
                    </svg>
                </PannableCanvas>
            </div>
        );
    }
);

/** How far (px) a press may travel and still count as a tap, not a pan. */
const TAP_SLOP_PX = 4;

/** Height of the caption band drawn above the tiles when blocks exist. */
const BLOCK_CAPTION_BAND = 22;

/** A structural entry drawn as a slim tile instead of a letter. */
type SlimTile = 'boundary' | 'join';

/**
 * The `.` entry (a virtual glyph whose character is the block boundary) and
 * the `‿` entry (the block join) are slim tiles; anything else is a letter.
 */
function slimTileOf(glyph: GlyphForCanvas): SlimTile | null {
    if (!isVirtualGlyphId(glyph.id)) return null;
    if (isBoundaryGlyphName(glyph.name)) return 'boundary';
    if (isJoinGlyphName(glyph.name)) return 'join';
    return null;
}

/** What each slim tile shows and says. */
const SLIM_TILES: Record<SlimTile, { mark: string; title: string }> = {
    boundary: { mark: '·', title: 'Block boundary' },
    join: { mark: '‿', title: 'Block join' },
};

interface PositionedOutline {
    block: CanvasBlockOutline;
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * The rectangle around each block's tiles: the union of their CELLS (the
 * guide squares, not the margin boxes), grown by a small gap. A block whose
 * tiles are not all on the canvas (an id missing from the map) is skipped
 * rather than drawn around the wrong tiles.
 */
function layoutBlockOutlines(
    blocks: CanvasBlockOutline[] | undefined,
    positioned: CanvasGlyph[],
    sourceIndices: number[],
): PositionedOutline[] {
    if (!blocks || blocks.length === 0) return [];
    const bySource = new Map<number, CanvasGlyph>();
    for (const pg of positioned) bySource.set(sourceIndices[pg.index], pg);

    const out: PositionedOutline[] = [];
    for (const block of blocks) {
        const tiles: CanvasGlyph[] = [];
        for (const index of block.entryIndices) {
            const tile = bySource.get(index);
            if (tile) tiles.push(tile);
        }
        if (tiles.length === 0 || tiles.length !== block.entryIndices.length) continue;
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const tile of tiles) {
            const insetX = tile.width * GLYPH_GUIDE_INSET;
            const insetY = tile.height * GLYPH_GUIDE_INSET;
            minX = Math.min(minX, tile.x + insetX);
            minY = Math.min(minY, tile.y + insetY);
            maxX = Math.max(maxX, tile.x + tile.width - insetX);
            maxY = Math.max(maxY, tile.y + tile.height - insetY);
        }
        const gap = 3;
        out.push({ block, x: minX - gap, y: minY - gap, width: maxX - minX + gap * 2, height: maxY - minY + gap * 2 });
    }
    return out;
}

/**
 * A block's thin coloured outline and its caption: the template name and a
 * "Block…" button that opens the block popover. The outline itself is
 * clickable too (pointer users); the button is the keyboard path.
 */
function BlockOutline({ outline, onOpen }: { outline: PositionedOutline; onOpen?: (key: number) => void }) {
    const { block, x, y, width, height } = outline;
    const captionWidth = Math.max(width, 96);
    return (
        <g
            className={styles.blockGroup}
            data-block-key={block.key}
            data-block-entries={block.entryIndices.join(',')}
        >
            <rect
                className={styles.blockOutline}
                style={{ stroke: block.colour }}
                x={x}
                y={y}
                width={width}
                height={height}
                rx={6}
                ry={6}
            />
            {/* The clickable part is the BORDER (a wider, invisible stroke):
                the inside belongs to the tiles, where a tap places the
                insertion point. The caption button is the other way in. */}
            <rect
                className={styles.blockOutlineHit}
                x={x}
                y={y}
                width={width}
                height={height}
                rx={6}
                ry={6}
                onClick={onOpen ? (event) => { event.stopPropagation(); onOpen(block.key); } : undefined}
            >
                <title>{`Block: ${block.label}`}</title>
            </rect>
            <foreignObject x={x} y={y - BLOCK_CAPTION_BAND} width={captionWidth} height={BLOCK_CAPTION_BAND}>
                <div className={styles.blockCaption}>
                    <span className={styles.blockCaptionName} style={{ color: block.colour }}>{block.label}</span>
                    {onOpen && (
                        <button
                            type="button"
                            className={styles.blockCaptionButton}
                            onClick={() => onOpen(block.key)}
                            aria-label={`Block ${block.label}: forms, split and join`}
                        >
                            Block…
                        </button>
                    )}
                </div>
            </foreignObject>
        </g>
    );
}

/**
 * A glyph's CELL — the guide square, the space the letter reserves — drawn
 * as the tile under it. The box around the cell is the letter's margin and
 * gets no tile: it belongs to the neighbours as much as to this letter.
 */
function GlyphCell({ positionedGlyph, slim = null }: { positionedGlyph: CanvasGlyph; slim?: SlimTile | null }) {
    const { glyph, x, y, width, height } = positionedGlyph;
    const isVirtual = isVirtualGlyphId(glyph.id);
    const insetX = width * GLYPH_GUIDE_INSET;
    const insetY = height * GLYPH_GUIDE_INSET;

    if (slim !== null) {
        // A slim bar in the middle of the cell: a boundary or a join occupies
        // a position in the entry list (backspace and the strategies treat it
        // like any entry) but it is not a letter and must not read as one.
        const barWidth = Math.max(4, (width - insetX * 2) * 0.22);
        return (
            <rect
                className={classNames(styles.boundaryBackground, { [styles.joinBackground]: slim === 'join' })}
                x={x + width / 2 - barWidth / 2}
                y={y + insetY}
                width={barWidth}
                height={height - insetY * 2}
                rx={2}
                ry={2}
            />
        );
    }

    return (
        <rect
            className={classNames(styles.glyphBackground, {
                [styles.virtualBackground]: isVirtual,
            })}
            x={x + insetX}
            y={y + insetY}
            width={width - insetX * 2}
            height={height - insetY * 2}
            rx={4}
            ry={4}
        />
    );
}

/**
 * Individual glyph node rendered on the canvas — the full box, so ink drawn
 * in the margin overhangs the cell tile onto the neighbour's.
 * Virtual glyphs (negative IDs) are rendered with distinct styling.
 */
function GlyphNode({
    positionedGlyph,
    slim = null,
    pinned = false,
    source,
}: {
    positionedGlyph: CanvasGlyph;
    slim?: SlimTile | null;
    pinned?: boolean;
    /** Selection position: what a tap on the tile places the caret next to. */
    source?: number;
}) {
    const { glyph, x, y, width, height } = positionedGlyph;

    // Check if this is a virtual glyph
    const isVirtual = isVirtualGlyphId(glyph.id);

    // Sanitize SVG data
    const sanitizedSvg = useMemo(() => {
        return DOMPurify.sanitize(glyph.svg_data, {
            USE_PROFILES: { svg: true, svgFilters: true },
        });
    }, [glyph.svg_data]);

    if (slim !== null) {
        const tile = SLIM_TILES[slim];
        return (
            <g
                className={styles.boundaryNode}
                transform={`translate(${x}, ${y})`}
                data-boundary={slim === 'boundary' ? 'true' : undefined}
                data-join={slim === 'join' ? 'true' : undefined}
                data-tile-source={source}
            >
                <title>{tile.title}</title>
                <text x={width / 2} y={height / 2} className={styles.boundaryMark}>{tile.mark}</text>
            </g>
        );
    }

    return (
        <g
            className={classNames(styles.glyphNode, {
                [styles.virtualGlyph]: isVirtual,
            })}
            transform={`translate(${x}, ${y})`}
            data-tile-source={source}
        >
            {/* Tooltip for virtual glyphs */}
            {isVirtual && (
                <title>{isWhitespaceGlyphName(glyph.name) ? 'Space (word separator)' : `IPA Fallback: ${glyph.name}`}</title>
            )}

            {/* Glyph SVG content via foreignObject */}
            <foreignObject
                width={width}
                height={height}
                className={styles.glyphForeignObject}
            >
                <div
                    className={classNames(styles.glyphContent, {
                        [styles.virtualContent]: isVirtual,
                    })}
                    dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
                />
            </foreignObject>
            {pinned && (
                <circle
                    className={styles.pinMarker}
                    cx={width - width * GLYPH_GUIDE_INSET - 4}
                    cy={height * GLYPH_GUIDE_INSET + 4}
                    r={3}
                    data-pinned="true"
                >
                    <title>A specific form is pinned for this sign</title>
                </circle>
            )}
        </g>
    );
}

export default GlyphCanvas;
export { GlyphCanvas };
