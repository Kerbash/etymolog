/**
 * GlyphImageImport
 * ----------------
 * A compact "bring your own symbol" control: an **Import image…** button and a
 * drop target, plus a **Keep original colors** switch. It reads one file
 * (PNG / JPEG / WebP / GIF / SVG), runs it through {@link importFileToGlyphSvg},
 * and hands the resulting glyph SVG up via `onImport`. It owns NO form state —
 * the parent decides what to do with the SVG (the glyph form writes it into the
 * `glyphSvg` field; Phase 3's word form will write it into a word symbol) — so
 * the same control serves both without change.
 *
 * The default (switch off) is **line-art**: the image becomes a theme-following
 * `currentColor` mask, so an imported symbol behaves like a drawn glyph in both
 * light and dark themes. **Keep original colors** embeds the picture as-is and
 * will NOT adapt to dark mode; the help text says so.
 */

import classNames from 'classnames';
import { useCallback, useId, useRef, useState } from 'react';

import Button from 'cyber-components/interactable/buttons/button';
import { flex, sizing } from 'utils-styles';

import { importFileToGlyphSvg, type GlyphImportMode } from './rasterToGlyphSvg';

import styles from './glyphImport.module.scss';

export interface GlyphImageImportProps {
    /** Called with the produced glyph SVG and how the file was interpreted. */
    onImport: (svg: string, mode: GlyphImportMode) => void;
    /** Disable the whole control (e.g. while the form is submitting). */
    disabled?: boolean;
    className?: string;
}

const ACCEPT =
    'image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.png,.jpg,.jpeg,.webp,.gif,.svg';

export default function GlyphImageImport({ onImport, disabled, className }: GlyphImageImportProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [keepColors, setKeepColors] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [dragActive, setDragActive] = useState(false);
    const keepColorsId = useId();
    const errorId = useId();

    const handleFile = useCallback(
        async (file: File | undefined | null) => {
            if (!file || disabled) return;
            setError(null);
            setBusy(true);
            try {
                const { svg, mode } = await importFileToGlyphSvg(file, { keepColors });
                onImport(svg, mode);
            } catch (caught) {
                setError(caught instanceof Error ? caught.message : 'That image could not be imported.');
            } finally {
                setBusy(false);
                // Allow re-selecting the same file (a change event won't fire otherwise).
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        },
        [disabled, keepColors, onImport],
    );

    const onDrop = useCallback(
        (event: React.DragEvent) => {
            event.preventDefault();
            setDragActive(false);
            if (disabled) return;
            void handleFile(event.dataTransfer.files?.[0]);
        },
        [disabled, handleFile],
    );

    const onDragOver = useCallback(
        (event: React.DragEvent) => {
            event.preventDefault();
            if (!disabled) setDragActive(true);
        },
        [disabled],
    );

    return (
        <div
            className={classNames(styles.control, dragActive && styles.dragActive, className)}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={() => setDragActive(false)}
        >
            <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT}
                className={styles.hiddenInput}
                disabled={disabled}
                onChange={(event) => void handleFile(event.target.files?.[0])}
                aria-describedby={error ? errorId : undefined}
            />

            <div className={classNames(flex.flexRow, flex.flexGapM, flex.alignItemsCenter, flex.flexWrap)}>
                <Button
                    type="button"
                    disabled={disabled || busy}
                    onClick={() => fileInputRef.current?.click()}
                >
                    {busy ? 'Importing…' : 'Import image…'}
                </Button>
                <span className={styles.dropHint}>or drop a PNG, JPEG, WebP, GIF or SVG here</span>
            </div>

            <label className={classNames(flex.flexRow, flex.flexGapS, flex.alignItemsCenter, styles.keepColors)}>
                <input
                    id={keepColorsId}
                    type="checkbox"
                    checked={keepColors}
                    disabled={disabled}
                    onChange={(event) => setKeepColors(event.target.checked)}
                />
                <span>Keep original colors</span>
            </label>

            <p className={classNames(sizing.marginNone, styles.help)}>
                {keepColors
                    ? 'The image is embedded as-is. It will NOT adapt to dark mode.'
                    : 'Dark lines on a light background become ink that follows the theme, like a drawn glyph.'}
            </p>

            {error && (
                <p id={errorId} role="alert" className={classNames(sizing.marginNone, styles.error)}>
                    {error}
                </p>
            )}
        </div>
    );
}
