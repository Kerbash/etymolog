/**
 * Export Dropdown Component
 * --------------------------
 * Dropdown menu for exporting phrase translations as SVG or PNG.
 */

import { type RefObject, useState } from 'react';
import DropDownSmall from 'cyber-components/container/dropDownSmall/dropDownSmall';
import type { GlyphSpellingDisplayRef } from '../../../display/spelling/types';
import {
    exportSvgToBlob,
    exportSvgToPngBlob,
    downloadBlob,
    generateFilename,
} from 'utils-func/graphic/export';
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

    const handleExportSvg = () => {
        const svgElement = glyphSpellingRef.current?.getSvgElement();
        if (!svgElement) {
            console.error('SVG element not available');
            return;
        }

        try {
            setIsExporting(true);
            const blob = exportSvgToBlob(svgElement, {
                padding: 20,
                backgroundColor: 'white',
            });

            const filename = generateFilename(phrase, 'svg');
            downloadBlob(blob, filename);
        } catch (error) {
            console.error('Failed to export SVG:', error);
        } finally {
            setIsExporting(false);
        }
    };

    const handleExportPng = async () => {
        const svgElement = glyphSpellingRef.current?.getSvgElement();
        if (!svgElement) {
            console.error('SVG element not available');
            return;
        }

        try {
            setIsExporting(true);
            const blob = await exportSvgToPngBlob(svgElement, {
                padding: 20,
                backgroundColor: 'white',
                scale: 6,  // 6x resolution for high-quality exports
                quality: 0.98,
            });

            const filename = generateFilename(phrase, 'png');
            downloadBlob(blob, filename);
        } catch (error) {
            console.error('Failed to export PNG:', error);
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <DropDownSmall
            toggleBtn={
                <span className={styles.exportButton}>
                    {isExporting ? 'Exporting...' : 'Export ▼'}
                </span>
            }
            contentPin="bottom-end"
            ariaLabel="Export phrase translation"
            disabled={isExporting}
        >
            <button
                onClick={handleExportSvg}
                className={styles.exportMenuItem}
                disabled={isExporting}
            >
                📄 Export as SVG
            </button>
            <button
                onClick={handleExportPng}
                className={styles.exportMenuItem}
                disabled={isExporting}
            >
                🖼️ Export as PNG
            </button>
        </DropDownSmall>
    );
}
