/**
 * GlyphKeyboardOverlay Component
 *
 * A bottom-pinned overlay that displays available glyphs for selection.
 * Wraps the CustomKeyboard component with glyph-specific rendering.
 * Supports two modes: Glyphs (database glyphs) and IPA (virtual glyph creation).
 *
 * @module glyphCanvasInput/GlyphKeyboardOverlay
 */

'use client';

import React, {useMemo, useCallback, useEffect, useRef, useState} from 'react';
import classNames from 'classnames';
import DOMPurify from 'dompurify';

import CustomKeyboard from 'cyber-components/interactable/customKeyboard/customKeyboard';
import type {KeyboardCharacter} from 'cyber-components/interactable/customKeyboard/types';
import {IPA_CHARACTERS} from 'cyber-components/interactable/customKeyboard/ipaCharacters';
import IconButton from 'cyber-components/interactable/buttons/iconButton/iconButton';
import HoverToolTip from 'cyber-components/interactable/information/hoverToolTip/hoverToolTip';

import type {GlyphKeyboardOverlayProps, GlyphLike, KeyboardMode} from './types';
import {createSpaceGlyph, createVirtualGlyph} from './utils';

import styles from './GlyphKeyboardOverlay.module.scss';

/**
 * Glyph-specific wording for the shared keyboard's key row: here a space is a
 * word separator and backspace removes a whole glyph, not a text character.
 */
const KEYBOARD_TRANSLATIONS = {
    spaceAriaLabel: 'Space - insert a word separator',
    backspaceAriaLabel: 'Backspace - remove the glyph before the insertion point',
};

/**
 * Map a GlyphLike to KeyboardCharacter format.
 */
function glyphToKeyboardCharacter(glyph: GlyphLike): KeyboardCharacter {
    return {
        id: String(glyph.id),
        label: glyph.name,
        value: String(glyph.id),
        displayType: 'svg',
        displayData: glyph.svg_data,
        category: glyph.category ?? 'Uncategorized',
        tags: [glyph.name.toLowerCase()],
        ariaLabel: `Insert glyph: ${glyph.name}`,
        metadata: {
            description: glyph.notes ?? undefined,
        },
    };
}

/**
 * Custom renderer for glyph characters.
 * Renders the SVG content safely using DOMPurify and wraps in HoverToolTip.
 */
function renderGlyphCharacter(character: KeyboardCharacter): React.ReactNode {
    if (character.displayType === 'svg' && character.displayData) {
        const sanitizedSvg = DOMPurify.sanitize(character.displayData, {
            USE_PROFILES: {svg: true, svgFilters: true},
        });

        return (
            <HoverToolTip content={character.label} contentPin="top">
                <span
                    className={styles.glyphSvgContent}
                    dangerouslySetInnerHTML={{__html: sanitizedSvg}}
                />
            </HoverToolTip>
        );
    }

    // Fallback to label if no SVG data
    return (
        <HoverToolTip content={character.label} contentPin="top">
            <span className={styles.glyphLabelContent}>{character.label}</span>
        </HoverToolTip>
    );
}

/**
 * Convert IPA characters to single "IPA" category for keyboard display.
 * All IPA characters are grouped under one category for simplicity.
 */
function wrapIpaAsKeyboardCharacters(): KeyboardCharacter[] {
    return IPA_CHARACTERS.map(char => ({
        ...char,
        category: 'IPA',  // Single category for all IPA characters
    }));
}

/**
 * GlyphKeyboardOverlay
 *
 * A bottom-pinned overlay that shows a glyph picker keyboard.
 * Supports search, category grouping, and add/remove/clear actions.
 * Can toggle between Glyphs mode (database glyphs) and IPA mode (virtual glyph creation).
 *
 * @example
 * ```tsx
 * <GlyphKeyboardOverlay
 *   availableGlyphs={glyphs}
 *   onSelect={(glyph) => handleAddGlyph(glyph)}
 *   onRemove={() => handleRemoveGlyph()}
 *   isOpen={isKeyboardOpen}
 *   onClose={() => setIsKeyboardOpen(false)}
 *   enableIpaMode={true}
 *   onIpaSelect={(char, virtualGlyph) => handleIpaSelect(virtualGlyph)}
 * />
 * ```
 */
export default function GlyphKeyboardOverlay({
                                                 availableGlyphs,
                                                 onSelect,
                                                 onRemove,
                                                 onClear,
                                                 isOpen,
                                                 onClose,
                                                 searchable = true,
                                                 height = '260px',
                                                 className,
                                                 style,
                                                 enableIpaMode = false,
                                                 onIpaSelect,
                                                 onBoundary,
                                                 onJoin,
                                             }: GlyphKeyboardOverlayProps) {
    const overlayRef = useRef<HTMLDivElement>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);

    // Keyboard mode state (glyphs or IPA)
    const [mode, setMode] = useState<KeyboardMode>('glyphs');

    // Convert glyphs to keyboard characters
    const glyphCharacters = useMemo(() => {
        return availableGlyphs.map(glyphToKeyboardCharacter);
    }, [availableGlyphs]);

    // IPA characters wrapped for keyboard display
    const ipaCharacters = useMemo(() => {
        return wrapIpaAsKeyboardCharacters();
    }, []);

    // Current characters based on mode
    const characters = mode === 'glyphs' ? glyphCharacters : ipaCharacters;
    const isGlyphsEmpty = mode === 'glyphs' && availableGlyphs.length === 0;

    // Create a map for quick glyph lookup by ID
    const glyphMap = useMemo(() => {
        const map = new Map<number, GlyphLike>();
        for (const glyph of availableGlyphs) {
            map.set(glyph.id, glyph);
        }
        return map;
    }, [availableGlyphs]);

    // Handle character selection (for glyph mode)
    const handleGlyphSelect = useCallback((character: KeyboardCharacter) => {
        const glyphId = parseInt(character.id, 10);
        const glyph = glyphMap.get(glyphId);
        if (glyph) {
            onSelect(glyph);
        }
    }, [glyphMap, onSelect]);

    // Handle IPA character selection (creates virtual glyph)
    const handleIpaCharacterSelect = useCallback((character: KeyboardCharacter) => {
        const ipaChar = character.label;
        const description = character.metadata?.description as string | undefined;
        const virtualGlyph = createVirtualGlyph(ipaChar, description);

        // Call onIpaSelect if provided
        if (onIpaSelect) {
            onIpaSelect(ipaChar, virtualGlyph);
        }

        // Also call onSelect with the virtual glyph as a GlyphLike
        onSelect({
            id: virtualGlyph.id,
            name: virtualGlyph.name,
            svg_data: virtualGlyph.svg_data,
            category: virtualGlyph.category,
            notes: virtualGlyph.notes,
        });
    }, [onSelect, onIpaSelect]);

    // Unified select handler based on mode
    const handleSelect = useCallback((character: KeyboardCharacter) => {
        if (mode === 'glyphs') {
            handleGlyphSelect(character);
        } else {
            handleIpaCharacterSelect(character);
        }
    }, [mode, handleGlyphSelect, handleIpaCharacterSelect]);

    // Space bar: inserts the word-separator virtual glyph in either mode.
    // Goes through onSelect exactly like an IPA key, so the parent registers
    // it in its virtual-glyph map and it serialises to " " in glyph_order.
    const handleSpace = useCallback(() => {
        const spaceGlyph = createSpaceGlyph();
        onSelect({
            id: spaceGlyph.id,
            name: spaceGlyph.name,
            svg_data: spaceGlyph.svg_data,
            category: spaceGlyph.category,
            notes: spaceGlyph.notes,
        });
    }, [onSelect]);

    // Handle keyboard close on Escape
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            }
            const activeElement = document.activeElement as HTMLElement | null;
            const isInInput = activeElement?.tagName === 'INPUT' ||
                activeElement?.tagName === 'TEXTAREA' ||
                activeElement?.isContentEditable === true;

            // Backspace triggers remove when not in search input
            if (e.key === 'Backspace' && onRemove && !isInInput) {
                e.preventDefault();
                onRemove();
            }

            // Space inserts a word separator when not typing in the search box.
            // A focused button (a glyph key, the space bar itself) already
            // activates on Space natively — handling it here too would insert
            // twice or swallow the button's own action.
            const isOnButton = activeElement?.tagName === 'BUTTON' ||
                activeElement?.getAttribute('role') === 'button';
            if (e.key === ' ' && !e.repeat && !isInInput && !isOnButton) {
                e.preventDefault();
                handleSpace();
            }

            // `.` inserts a block boundary (only while the block scheme is on,
            // i.e. `onBoundary` is provided). Same guards as Space, except the
            // focused-button one: `.` does not activate a button, so after
            // tapping a glyph key the physical `.` must still work. Modified
            // presses (Ctrl+., Alt+.) are left to the browser / OS.
            if (e.key === '.' && onBoundary && !e.repeat && !isInInput
                && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                onBoundary();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose, onRemove, handleSpace, onBoundary]);

    // Focus management
    useEffect(() => {
        if (isOpen) {
            // Store current focus
            previousFocusRef.current = document.activeElement as HTMLElement;

            // Focus the overlay
            setTimeout(() => {
                overlayRef.current?.focus();
            }, 0);
        } else {
            // Restore focus when closing
            if (previousFocusRef.current) {
                previousFocusRef.current.focus();
                previousFocusRef.current = null;
            }
        }
    }, [isOpen]);

    // Don't render if not open
    if (!isOpen) {
        return null;
    }

    return (
        <div
            ref={overlayRef}
            className={classNames(styles.overlay, className)}
            style={style}
            role="dialog"
            aria-label="Glyph keyboard"
            aria-modal="true"
            tabIndex={-1}
        >
            {/* Header with mode toggle and actions */}
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <span className={styles.title}>
                        {mode === 'glyphs' ? 'Select Glyph' : 'Select IPA Character'}
                    </span>

                    {/* Mode toggle buttons */}
                    {enableIpaMode && (
                        <div className={styles.modeToggle} role="tablist" aria-label="Keyboard mode">
                            <button
                                type="button"
                                role="tab"
                                aria-selected={mode === 'glyphs'}
                                className={classNames(styles.modeButton, {
                                    [styles.active]: mode === 'glyphs',
                                })}
                                onClick={() => setMode('glyphs')}
                            >
                                Glyphs
                            </button>
                            <button
                                type="button"
                                role="tab"
                                aria-selected={mode === 'ipa'}
                                className={classNames(styles.modeButton, {
                                    [styles.active]: mode === 'ipa',
                                })}
                                onClick={() => setMode('ipa')}
                            >
                                IPA
                            </button>
                        </div>
                    )}
                </div>

                <div className={styles.actions}>
                    {onClear && (
                        <HoverToolTip content={"Clear all glyphs"} contentPin="top">
                            <IconButton
                                type="button"
                                iconName="trash"
                                onClick={onClear}
                                aria-label="Clear all glyphs"
                                themeType="basic"
                                iconSize="1rem"
                                iconColor="var(--status-bad)"
                            />
                        </HoverToolTip>
                    )}
                    <IconButton
                        iconName="x"
                        onClick={onClose}
                        aria-label="Close keyboard"
                        themeType="basic"
                        iconSize="1.25rem"
                    />
                </div>
            </div>

            {/* Keyboard content. `fill` makes the key grid the panel's ONE
                scroll area; the shared key row (Space + Backspace) sits under
                it and stays visible, including when there are no glyphs yet. */}
            <div className={styles.content}>
                <CustomKeyboard
                    fill
                    characters={isGlyphsEmpty ? [] : characters}
                    onSelect={handleSelect}
                    searchable={searchable && !isGlyphsEmpty}
                    groupBy="category"
                    height={height}
                    emptyStateText={mode === 'glyphs' ? 'No matching glyphs' : 'No matching IPA characters'}
                    emptyState={isGlyphsEmpty ? (
                        <div className={styles.emptyState}>
                            No glyphs available. Create some glyphs first.
                            {enableIpaMode && (
                                <button
                                    type="button"
                                    className={styles.switchModeLink}
                                    onClick={() => setMode('ipa')}
                                >
                                    Switch to IPA keyboard
                                </button>
                            )}
                        </div>
                    ) : undefined}
                    renderCharacter={mode === 'glyphs' ? renderGlyphCharacter : undefined}
                    onSpace={handleSpace}
                    onBackspace={onRemove}
                    translationMap={KEYBOARD_TRANSLATIONS}
                />
                {/* Block-script boundary and join keys, beside the shared key
                    row (the shared keyboard has no slot for extra keys, so it
                    is a row of its own directly under Space / Backspace). */}
                {(onBoundary || onJoin) && (
                    <div className={styles.extraKeyRow}>
                        {onBoundary && (
                            <HoverToolTip content="Insert a block boundary (or press .)" contentPin="top">
                                <button
                                    type="button"
                                    className={styles.boundaryKey}
                                    onClick={onBoundary}
                                    aria-label="Boundary - insert a block boundary"
                                >
                                    <span className={styles.boundaryKeyMark} aria-hidden="true">·</span>
                                    Boundary
                                </button>
                            </HoverToolTip>
                        )}
                        {onJoin && (
                            <HoverToolTip content="Keep the signs on both sides in one block" contentPin="top">
                                <button
                                    type="button"
                                    className={styles.boundaryKey}
                                    onClick={onJoin}
                                    aria-label="Join - keep the signs on both sides in one block"
                                >
                                    <span className={styles.boundaryKeyMark} aria-hidden="true">‿</span>
                                    Join
                                </button>
                            </HoverToolTip>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export {GlyphKeyboardOverlay};
