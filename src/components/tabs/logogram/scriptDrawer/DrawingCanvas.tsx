import classNames from 'classnames';
import IconButton from 'cyber-components/interactable/buttons/iconButton/iconButton';
import type { DrawingElement, Tool, ResizeHandle } from './types';
import styles from './scriptDrawer.module.scss';

interface DrawingCanvasProps {
    elements: DrawingElement[];
    activeTool: Tool;
    activeColor: string;
    currentStrokePath: string;
    previewElement: DrawingElement | null;
    onPointerDown: (e: React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>) => void;
    onPointerMove: (e: React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>) => void;
    onPointerUp: () => void;
    onPointerLeave: () => void;
    onDeleteSelected: () => void;
    getElementBounds: (el: DrawingElement) => { x: number; y: number; width: number; height: number };
}

function renderElement(element: DrawingElement, isPreview = false) {
    const baseClass = classNames(
        styles.element,
        element.selected && styles.elementSelected
    );

    const key = isPreview ? `preview-${element.id}` : element.id;

    switch (element.type) {
        case 'pen':
            return (
                <path
                    key={key}
                    d={element.pathData}
                    fill={element.color}
                    className={baseClass}
                />
            );
        case 'dot':
            return (
                <circle
                    key={key}
                    cx={element.x}
                    cy={element.y}
                    r={element.radius}
                    fill={element.color}
                    className={baseClass}
                />
            );
        case 'square':
            return (
                <rect
                    key={key}
                    x={element.x}
                    y={element.y}
                    width={element.width}
                    height={element.height}
                    fill="none"
                    stroke={element.color}
                    strokeWidth={element.strokeWidth}
                    className={baseClass}
                />
            );
        case 'circle':
            return (
                <ellipse
                    key={key}
                    cx={element.cx}
                    cy={element.cy}
                    rx={element.rx}
                    ry={element.ry}
                    fill="none"
                    stroke={element.color}
                    strokeWidth={element.strokeWidth}
                    className={baseClass}
                />
            );
    }
}

function renderSelectionBox(element: DrawingElement, getElementBounds: (el: DrawingElement) => { x: number; y: number; width: number; height: number }) {
    if (!element.selected) return null;

    const bounds = getElementBounds(element);
    const padding = 4;

    return (
        <rect
            key={`selection-${element.id}`}
            x={bounds.x - padding}
            y={bounds.y - padding}
            width={bounds.width + padding * 2}
            height={bounds.height + padding * 2}
            className={styles.selectionBox}
        />
    );
}

function renderResizeHandles(element: DrawingElement, getElementBounds: (el: DrawingElement) => { x: number; y: number; width: number; height: number }) {
    if (!element.selected) return null;

    const bounds = getElementBounds(element);
    const handleSize = 6;

    const handles: { handle: ResizeHandle; x: number; y: number; cursor: string }[] = [
        { handle: 'nw', x: bounds.x, y: bounds.y, cursor: 'nwse-resize' },
        { handle: 'ne', x: bounds.x + bounds.width, y: bounds.y, cursor: 'nesw-resize' },
        { handle: 'sw', x: bounds.x, y: bounds.y + bounds.height, cursor: 'nesw-resize' },
        { handle: 'se', x: bounds.x + bounds.width, y: bounds.y + bounds.height, cursor: 'nwse-resize' },
    ];

    return handles.map(({ handle, x, y, cursor }) => (
        <circle
            key={`handle-${element.id}-${handle}`}
            cx={x}
            cy={y}
            r={handleSize}
            className={styles.resizeHandle}
            style={{ cursor }}
        />
    ));
}

export default function DrawingCanvas({
    elements,
    activeTool,
    activeColor,
    currentStrokePath,
    previewElement,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerLeave,
    onDeleteSelected,
    getElementBounds,
}: DrawingCanvasProps) {
    const handleTouchStart = (e: React.TouchEvent<SVGSVGElement>) => {
        e.preventDefault();
        onPointerDown(e);
    };

    const handleTouchMove = (e: React.TouchEvent<SVGSVGElement>) => {
        e.preventDefault();
        onPointerMove(e);
    };

    const handleTouchEnd = (e: React.TouchEvent<SVGSVGElement>) => {
        e.preventDefault();
        onPointerUp();
    };

    // Find selected element for delete button positioning
    const selectedElement = elements.find(el => el.selected);
    const showSelectionUI = activeTool === 'select' && selectedElement;

    // Calculate delete button position (above top-right corner)
    let deleteButtonPosition: { x: number; y: number } | null = null;
    if (showSelectionUI && selectedElement) {
        const bounds = getElementBounds(selectedElement);
        deleteButtonPosition = {
            x: bounds.x + bounds.width,
            y: bounds.y - 24, // Above the top-right handle
        };
    }

    return (
        <div className={styles.canvasWrapper}>
            <svg
                className={classNames(
                    styles.canvas,
                    activeTool === 'select' && styles.canvasSelect,
                    activeTool === 'eraser' && styles.canvasEraser
                )}
                width={300}
                height={300}
                viewBox="0 0 300 300"
                onMouseDown={onPointerDown}
                onMouseMove={onPointerMove}
                onMouseUp={onPointerUp}
                onMouseLeave={onPointerLeave}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                {/* Rendered elements */}
                {elements.map(el => renderElement(el))}

                {/* Selection boxes - only show when select tool is active */}
                {showSelectionUI && elements.map(el => renderSelectionBox(el, getElementBounds))}

                {/* Resize handles - only show when select tool is active */}
                {showSelectionUI && elements.map(el => renderResizeHandles(el, getElementBounds))}

                {/* Current pen stroke preview */}
                {currentStrokePath && (
                    <path
                        d={currentStrokePath}
                        fill={activeColor}
                        opacity={0.8}
                    />
                )}

                {/* Shape preview */}
                {previewElement && renderElement({ ...previewElement, selected: false }, true)}
            </svg>

            {/* Delete button - positioned above top-right corner */}
            {showSelectionUI && deleteButtonPosition && (
                <div
                    className={styles.deleteButtonWrapper}
                    style={{
                        left: deleteButtonPosition.x,
                        top: deleteButtonPosition.y,
                    }}
                >
                    <IconButton
                        iconName="trash"
                        iconSize={14}
                        onClick={onDeleteSelected}
                        className={styles.deleteButton}
                        title="Delete (Del)"
                    />
                </div>
            )}
        </div>
    );
}
