/**
 * GlyphKeyboardOverlay Component
 *
 * A bottom-pinned overlay that displays available glyphs for selection.
 * Wraps the CustomKeyboard component with glyph-specific rendering.
 *
 * @module glyphCanvasInput/GlyphKeyboardOverlay
 */

'use client';

import React, {useMemo, useCallback, useEffect, useRef} from 'react';
import classNames from 'classnames';
import DOMPurify from 'dompurify';

import CustomKeyboard from 'cyber-components/interactable/customKeyboard/customKeyboard';
import type {KeyboardCharacter} from 'cyber-components/interactable/customKeyboard/types';
import IconButton from 'cyber-components/interactable/buttons/iconButton/iconButton';
import HoverToolTip from 'cyber-components/interactable/information/hoverToolTip/hoverToolTip';

import type {GlyphKeyboardOverlayProps, GlyphLike} from './types';

import styles from './GlyphKeyboardOverlay.module.scss';

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
 * GlyphKeyboardOverlay
 *
 * A bottom-pinned overlay that shows a glyph picker keyboard.
 * Supports search, category grouping, and add/remove/clear actions.
 *
 * @example
 * ```tsx
 * <GlyphKeyboardOverlay
 *   availableGlyphs={glyphs}
 *   onSelect={(glyph) => handleAddGlyph(glyph)}
 *   onRemove={() => handleRemoveGlyph()}
 *   isOpen={isKeyboardOpen}
 *   onClose={() => setIsKeyboardOpen(false)}
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
                                             }: GlyphKeyboardOverlayProps) {
    const overlayRef = useRef<HTMLDivElement>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);

    // Convert glyphs to keyboard characters
    const characters = useMemo(() => {
        return availableGlyphs.map(glyphToKeyboardCharacter);
    }, [availableGlyphs]);

    // Create a map for quick glyph lookup by ID
    const glyphMap = useMemo(() => {
        const map = new Map<number, GlyphLike>();
        for (const glyph of availableGlyphs) {
            map.set(glyph.id, glyph);
        }
        return map;
    }, [availableGlyphs]);

    // Handle character selection
    const handleSelect = useCallback((character: KeyboardCharacter) => {
        const glyphId = parseInt(character.id, 10);
        const glyph = glyphMap.get(glyphId);
        if (glyph) {
            onSelect(glyph);
        }
    }, [glyphMap, onSelect]);

    // Handle keyboard close on Escape
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            }
            // Backspace triggers remove when not in search input
            if (e.key === 'Backspace' && onRemove) {
                const activeElement = document.activeElement;
                const isInInput = activeElement?.tagName === 'INPUT' ||
                    activeElement?.tagName === 'TEXTAREA';
                if (!isInInput) {
                    e.preventDefault();
                    onRemove();
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose, onRemove]);

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
            {/* Header with actions */}
            <div className={styles.header}>
                <span className={styles.title}>Select Glyph</span>
                <div className={styles.actions}>
                    {onRemove && (
                        <HoverToolTip content={"Backspace"} contentPin="top">
                            <IconButton
                                type="button"
                                iconName="backspace"
                                onClick={onRemove}
                                aria-label="Remove last glyph"
                                themeType="basic"
                                iconSize="1rem"
                            />
                        </HoverToolTip>
                    )}
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

            {/* Keyboard content */}
            <div className={styles.content}>
                {availableGlyphs.length === 0 ? (
                    <div className={styles.emptyState}>
                        No glyphs available. Create some glyphs first.
                    </div>
                ) : (
                    <div className={styles.keyboardWrapper}>
                        <CustomKeyboard
                            characters={characters}
                            onSelect={handleSelect}
                            searchable={searchable}
                            groupBy="category"
                            height={height}
                            emptyStateText="No matching glyphs"
                            renderCharacter={renderGlyphCharacter}
                        />
                        {/* Backspace button - prominent keyboard-style */}
                        {onRemove && (
                            <div className={styles.keyboardActions}>
                                <HoverToolTip content="Backspace - Remove last glyph" contentPin="top">
                                    <button
                                        type="button"
                                        className={styles.backspaceButton}
                                        onClick={onRemove}
                                        aria-label="Backspace - Remove last glyph"
                                    >
                                        <i className="bi-backspace" aria-hidden="true"/>
                                        <span className={styles.backspaceLabel}>Backspace</span>
                                    </button>
                                </HoverToolTip>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export {GlyphKeyboardOverlay};
