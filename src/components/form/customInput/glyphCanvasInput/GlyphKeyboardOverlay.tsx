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
import {createVirtualGlyph} from './utils';

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
                {mode === 'glyphs' && availableGlyphs.length === 0 ? (
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
                ) : (
                    <div className={styles.keyboardWrapper}>
                        <CustomKeyboard
                            characters={characters}
                            onSelect={handleSelect}
                            searchable={searchable}
                            groupBy="category"
                            height={height}
                            emptyStateText={mode === 'glyphs' ? 'No matching glyphs' : 'No matching IPA characters'}
                            renderCharacter={mode === 'glyphs' ? renderGlyphCharacter : undefined}
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
