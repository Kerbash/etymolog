/**
 * Export Dropdown Component
 * --------------------------
 * Dropdown menu for exporting phrase translations as SVG or PNG.
 */

import { type RefObject, useState } from 'react';
import DropDownSmall from 'cyber-components/container/dropDownSmall/dropDownSmall';
import SvgIcon from 'cyber-components/graphics/decor/svgIcon/svgIcon';
import type { GlyphSpellingDisplayRef } from '../../../display/spelling/types';
import { useNotify } from '../../../shared';
import {
    exportSvgToBlob,
    exportSvgToPngBlob,
    downloadBlob,
    generateFilename,
} from 'utils-func/graphic/export';
import graphic_template from '@styles/graphic_template.module.scss';
import styles from '../translator.module.scss';

interface ExportDropdownProps {
    /** The phrase being translated (for filename generation) */
    phrase: string;
    /** Ref to the GlyphSpellingDisplay component */
    glyphSpellingRef: RefObject<GlyphSpellingDisplayRef>;
}

export default function ExportDropdown({
    phrase,
    glyphSpellingRef
}: ExportDropdownProps) {
    const [isExporting, setIsExporting] = useState(false);
    const notify = useNotify();

    // Every failure path below used to be `console.error` and nothing else: the
    // user pressed Export, no file appeared, and the UI said nothing at all.

    const handleExportSvg = () => {
        const svgElement = glyphSpellingRef.current?.getSvgElement();
        if (!svgElement) {
            notify.error('The translation is not rendered yet — try again in a moment.', {
                title: 'Could not export SVG',
            });
            return;
        }

        try {
            setIsExporting(true);
            const blob = exportSvgToBlob(svgElement, {
                padding: 20,
                // A LITERAL, deliberately: the exported file is opened outside
                // the app, where no CSS custom property resolves, and an export
                // must not look different depending on the theme it was made in.
                backgroundColor: 'white',
            });

            const filename = generateFilename(phrase, 'svg');
            downloadBlob(blob, filename);
        } catch (error) {
            notify.error(error instanceof Error ? error.message : String(error), {
                title: 'Could not export SVG',
            });
        } finally {
            setIsExporting(false);
        }
    };

    const handleExportPng = async () => {
        const svgElement = glyphSpellingRef.current?.getSvgElement();
        if (!svgElement) {
            notify.error('The translation is not rendered yet — try again in a moment.', {
                title: 'Could not export PNG',
            });
            return;
        }

        try {
            setIsExporting(true);
            const blob = await exportSvgToPngBlob(svgElement, {
                padding: 20,
                backgroundColor: 'white', // see handleExportSvg
                scale: 6,  // 6x resolution for high-quality exports
                quality: 0.98,
            });

            const filename = generateFilename(phrase, 'png');
            downloadBlob(blob, filename);
        } catch (error) {
            notify.error(error instanceof Error ? error.message : String(error), {
                title: 'Could not export PNG',
            });
        } finally {
            setIsExporting(false);
        }
    };

    /**
     * `DropDownSmall` BUILDS the toggle element itself (`toggleBtnAs`, default
     * `'button'`) and renders `toggleBtn` as its children — so the toggle is
     * already a real `<button>` and the fix for the `<span>` that used to sit
     * inside it is to stop styling that span like a button and style the real
     * one instead, via `parts.toggleBtn`.
     *
     * Deliberately NOT an `IconButton` here: that renders its own `<button>`,
     * which inside `DropDownSmall`'s button would be an interactive element
     * nested in an interactive element — trading one defect for a worse one.
     */
    return (
        <DropDownSmall
            toggleBtn={
                <>
                    <SvgIcon iconName="download" aria-hidden="true" />
                    <span>{isExporting ? 'Exporting…' : 'Export'}</span>
                </>
            }
            parts={{ toggleBtn: { className: styles.exportButton } }}
            contentPin="bottom-end"
            ariaLabel="Export phrase translation"
            disabled={isExporting}
        >
            <button
                type="button"
                onClick={handleExportSvg}
                className={graphic_template.menuItem}
                disabled={isExporting}
            >
                <SvgIcon iconName="filetype-svg" aria-hidden="true" /> Export as SVG
            </button>
            <button
                type="button"
                onClick={() => void handleExportPng()}
                className={graphic_template.menuItem}
                disabled={isExporting}
            >
                <SvgIcon iconName="file-image" aria-hidden="true" /> Export as PNG
            </button>
        </DropDownSmall>
    );
}
