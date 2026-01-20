import { useCallback, useEffect } from 'react';
import { useDrawing } from './hooks/useDrawing';
import Toolbar from './Toolbar';
import ColorPicker from './ColorPicker';
import DrawingCanvas from './DrawingCanvas';
import ActionBar from './ActionBar';
import styles from './scriptDrawer.module.scss';

export default function ScriptDrawer() {
    const {
        elements,
        activeTool,
        activeColor,
        previewElement,
        setActiveTool,
        setActiveColor,
        handlePointerDown,
        handlePointerMove,
        handlePointerUp,
        handlePointerLeave,
        deleteSelected,
        deselectAll,
        getCurrentStrokePath,
        exportToSVG,
        getElementBounds,
        undo,
        redo,
        clear,
        canUndo,
        canRedo,
    } = useDrawing();

    const hasSelection = elements.some(el => el.selected);

    // Wrap tool change to deselect when leaving select tool
    const handleToolChange = useCallback((tool: typeof activeTool) => {
        if (activeTool === 'select' && tool !== 'select') {
            deselectAll();
        }
        setActiveTool(tool);
    }, [activeTool, setActiveTool, deselectAll]);

    // Keyboard listener for Delete key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                // Don't delete if user is typing in an input field
                if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                    return;
                }
                e.preventDefault();
                deleteSelected();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [deleteSelected]);

    const handleExport = useCallback(() => {
        const svg = exportToSVG();
        console.log('Exported SVG:', svg);

        // Copy to clipboard
        navigator.clipboard.writeText(svg).then(() => {
            alert('SVG copied to clipboard!');
        }).catch(err => {
            console.error('Failed to copy:', err);
            alert('SVG exported to console. Check developer tools.');
        });
    }, [exportToSVG]);

    return (
        <div className={styles.container}>
            <Toolbar
                activeTool={activeTool}
                onToolChange={handleToolChange}
            />

            <ColorPicker
                activeColor={activeColor}
                onColorChange={setActiveColor}
            />

            <DrawingCanvas
                elements={elements}
                activeTool={activeTool}
                activeColor={activeColor}
                currentStrokePath={getCurrentStrokePath()}
                previewElement={previewElement}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerLeave}
                onDeleteSelected={deleteSelected}
                getElementBounds={getElementBounds}
            />

            <ActionBar
                canUndo={canUndo}
                canRedo={canRedo}
                hasSelection={hasSelection}
                onUndo={undo}
                onRedo={redo}
                onClear={clear}
                onDelete={deleteSelected}
                onExport={handleExport}
            />
        </div>
    );
}
