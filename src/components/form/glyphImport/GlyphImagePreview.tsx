/**
 * GlyphImagePreview
 * -----------------
 * Shows an imported glyph SVG where the drawing canvas would be. The canvas
 * cannot round-trip a raster `<image>`/`<mask>` (it parses SVG into pen/shape
 * objects), so an import is displayed READ-ONLY here rather than loaded into
 * the drawer — with a control to discard it and go back to drawing.
 *
 * The SVG is rendered through `dangerouslySetInnerHTML`, which is safe because
 * the string has already been sanitised: a file import runs `sanitizeSvg` in
 * the codec, and the codec's own raster output is markup this app constructed.
 * The frame carries `color` so a line-art (`currentColor`) import shows the
 * reader's ink in either theme; the box background lets a `keep-colors` import
 * read against a neutral ground.
 */

import classNames from 'classnames';

import Button from 'cyber-components/interactable/buttons/button';
import { flex } from 'utils-styles';

import type { GlyphImportMode } from './rasterToGlyphSvg';

import styles from './glyphImport.module.scss';

export interface GlyphImagePreviewProps {
    /** The sanitised glyph SVG to display. */
    svg: string;
    /** How it was imported — drives the caption. */
    mode: GlyphImportMode;
    /** Discard the import and return to the drawing canvas. */
    onClear: () => void;
    className?: string;
}

const CAPTION: Record<GlyphImportMode, string> = {
    'line-art': 'Imported as line art — follows the theme',
    'keep-colors': 'Imported with original colours — will not adapt to dark mode',
    svg: 'Imported SVG',
};

export default function GlyphImagePreview({ svg, mode, onClear, className }: GlyphImagePreviewProps) {
    return (
        <div className={classNames(flex.flexColumn, flex.flexGapS, flex.alignItemsCenter, className)}>
            <div
                className={styles.preview}
                role="img"
                aria-label={`Imported glyph preview — ${CAPTION[mode]}`}
                dangerouslySetInnerHTML={{ __html: svg }}
            />
            <p className={styles.previewCaption}>{CAPTION[mode]}</p>
            <Button type="button" onClick={onClear}>
                Clear import / draw instead
            </Button>
        </div>
    );
}
