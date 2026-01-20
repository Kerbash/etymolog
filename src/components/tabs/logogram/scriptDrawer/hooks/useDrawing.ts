import { useState, useCallback, useRef } from 'react';
import getStroke from 'perfect-freehand';
import type { Tool, Point, DrawingElement, PenElement, DotElement, SquareElement, CircleElement, ResizeHandle } from '../types';
import { useHistory } from './useHistory';

function generateId(): string {
    return Math.random().toString(36).substring(2, 11);
}

function getSvgPathFromStroke(stroke: number[][]): string {
    if (!stroke.length) return '';

    const d = stroke.reduce(
        (acc, [x0, y0], i, arr) => {
            const [x1, y1] = arr[(i + 1) % arr.length];
            acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
            return acc;
        },
        ['M', ...stroke[0], 'Q']
    );

    d.push('Z');
    return d.join(' ');
}

const STROKE_OPTIONS = {
    size: 8,
    thinning: 0.5,
    smoothing: 0.5,
    streamline: 0.5,
    easing: (t: number) => t,
    start: {
        taper: 0,
        cap: true,
    },
    end: {
        taper: 0,
        cap: true,
    },
};

const DEFAULT_STROKE_WIDTH = 2;

export function useDrawing() {
    const history = useHistory();
    const [activeTool, setActiveTool] = useState<Tool>('pen');
    const [activeColor, setActiveColor] = useState<string>('var(--black)');
    const [isDrawing, setIsDrawing] = useState(false);
    const [currentStroke, setCurrentStroke] = useState<Point[]>([]);
    const [startPoint, setStartPoint] = useState<Point | null>(null);
    const [previewElement, setPreviewElement] = useState<DrawingElement | null>(null);
    const [dragOffset, setDragOffset] = useState<Point | null>(null);
    const [activeResizeHandle, setActiveResizeHandle] = useState<ResizeHandle>(null);
    const [resizeStartBounds, setResizeStartBounds] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
    const selectedIdRef = useRef<string | null>(null);

    // Get position from mouse or touch event
    const getPointerPosition = useCallback((e: React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>): Point => {
        const svg = e.currentTarget;
        const rect = svg.getBoundingClientRect();

        let clientX: number, clientY: number;

        if ('touches' in e) {
            // Touch event
            if (e.touches.length === 0) {
                // touchend - use changedTouches
                const touch = (e as React.TouchEvent).changedTouches[0];
                clientX = touch.clientX;
                clientY = touch.clientY;
            } else {
                const touch = e.touches[0];
                clientX = touch.clientX;
                clientY = touch.clientY;
            }
        } else {
            // Mouse event
            clientX = e.clientX;
            clientY = e.clientY;
        }

        return {
            x: clientX - rect.left,
            y: clientY - rect.top,
            pressure: 0.5,
        };
    }, []);

    const findElementAtPoint = useCallback((point: Point, elements: DrawingElement[]): DrawingElement | null => {
        // Search in reverse to find topmost element first
        for (let i = elements.length - 1; i >= 0; i--) {
            const el = elements[i];
            switch (el.type) {
                case 'dot':
                    const dotDist = Math.sqrt((point.x - el.x) ** 2 + (point.y - el.y) ** 2);
                    if (dotDist <= el.radius + 5) return el;
                    break;
                case 'square':
                    // For outline shapes, check if near the border
                    const nearLeft = Math.abs(point.x - el.x) <= 8;
                    const nearRight = Math.abs(point.x - (el.x + el.width)) <= 8;
                    const nearTop = Math.abs(point.y - el.y) <= 8;
                    const nearBottom = Math.abs(point.y - (el.y + el.height)) <= 8;
                    const withinX = point.x >= el.x - 8 && point.x <= el.x + el.width + 8;
                    const withinY = point.y >= el.y - 8 && point.y <= el.y + el.height + 8;
                    if ((withinX && (nearTop || nearBottom)) || (withinY && (nearLeft || nearRight))) return el;
                    break;
                case 'circle':
                    // For outline ellipse, check if near the border
                    const dx = (point.x - el.cx) / el.rx;
                    const dy = (point.y - el.cy) / el.ry;
                    const distFromCenter = Math.sqrt(dx * dx + dy * dy);
                    if (distFromCenter >= 0.8 && distFromCenter <= 1.3) return el;
                    break;
                case 'pen':
                    for (const p of el.points) {
                        const penDist = Math.sqrt((point.x - p.x) ** 2 + (point.y - p.y) ** 2);
                        if (penDist <= 10) return el;
                    }
                    break;
            }
        }
        return null;
    }, []);

    // Get bounding box of an element
    const getElementBounds = useCallback((el: DrawingElement): { x: number; y: number; width: number; height: number } => {
        switch (el.type) {
            case 'dot':
                return { x: el.x - el.radius, y: el.y - el.radius, width: el.radius * 2, height: el.radius * 2 };
            case 'square':
                return { x: el.x, y: el.y, width: el.width, height: el.height };
            case 'circle':
                return { x: el.cx - el.rx, y: el.cy - el.ry, width: el.rx * 2, height: el.ry * 2 };
            case 'pen':
                if (el.points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
                const xs = el.points.map(p => p.x);
                const ys = el.points.map(p => p.y);
                const minX = Math.min(...xs);
                const maxX = Math.max(...xs);
                const minY = Math.min(...ys);
                const maxY = Math.max(...ys);
                return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
        }
    }, []);

    // Check if point is on a resize handle
    const findResizeHandle = useCallback((point: Point, element: DrawingElement): ResizeHandle => {
        const bounds = getElementBounds(element);
        const handleSize = 8;

        const corners = {
            nw: { x: bounds.x, y: bounds.y },
            ne: { x: bounds.x + bounds.width, y: bounds.y },
            sw: { x: bounds.x, y: bounds.y + bounds.height },
            se: { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
        };

        for (const [handle, pos] of Object.entries(corners)) {
            const dist = Math.sqrt((point.x - pos.x) ** 2 + (point.y - pos.y) ** 2);
            if (dist <= handleSize) {
                return handle as ResizeHandle;
            }
        }

        return null;
    }, [getElementBounds]);

    const handlePointerDown = useCallback((e: React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>) => {
        const point = getPointerPosition(e);
        setIsDrawing(true);

        switch (activeTool) {
            case 'pen':
                setCurrentStroke([point]);
                break;
            case 'dot':
                const newDot: DotElement = {
                    id: generateId(),
                    type: 'dot',
                    color: activeColor,
                    selected: false,
                    x: point.x,
                    y: point.y,
                    radius: 4,
                };
                history.set([...history.elements, newDot]);
                setIsDrawing(false);
                break;
            case 'square':
            case 'circle':
                setStartPoint(point);
                break;
            case 'eraser':
                // Find and delete element at point
                const elementToErase = findElementAtPoint(point, history.elements);
                if (elementToErase) {
                    const filtered = history.elements.filter(el => el.id !== elementToErase.id);
                    history.set(filtered);
                }
                break;
            case 'select':
                const selectedElement = history.elements.find(el => el.selected);

                // Check if clicking on a resize handle of selected element
                if (selectedElement) {
                    const handle = findResizeHandle(point, selectedElement);
                    if (handle) {
                        setActiveResizeHandle(handle);
                        setResizeStartBounds(getElementBounds(selectedElement));
                        setStartPoint(point);
                        return;
                    }
                }

                const clickedElement = findElementAtPoint(point, history.elements);
                if (clickedElement) {
                    selectedIdRef.current = clickedElement.id;
                    let offsetX = 0, offsetY = 0;
                    switch (clickedElement.type) {
                        case 'dot':
                            offsetX = point.x - clickedElement.x;
                            offsetY = point.y - clickedElement.y;
                            break;
                        case 'square':
                            offsetX = point.x - clickedElement.x;
                            offsetY = point.y - clickedElement.y;
                            break;
                        case 'circle':
                            offsetX = point.x - clickedElement.cx;
                            offsetY = point.y - clickedElement.cy;
                            break;
                        case 'pen':
                            if (clickedElement.points.length > 0) {
                                offsetX = point.x - clickedElement.points[0].x;
                                offsetY = point.y - clickedElement.points[0].y;
                            }
                            break;
                    }
                    setDragOffset({ x: offsetX, y: offsetY });
                    const updatedElements = history.elements.map(el => ({
                        ...el,
                        selected: el.id === clickedElement.id,
                    }));
                    history.set(updatedElements, false);
                } else {
                    selectedIdRef.current = null;
                    const deselected = history.elements.map(el => ({
                        ...el,
                        selected: false,
                    }));
                    history.set(deselected, false);
                }
                break;
        }
    }, [activeTool, activeColor, history, getPointerPosition, findElementAtPoint, findResizeHandle, getElementBounds]);

    const handlePointerMove = useCallback((e: React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>) => {
        if (!isDrawing) return;

        const point = getPointerPosition(e);

        switch (activeTool) {
            case 'pen':
                setCurrentStroke(prev => [...prev, point]);
                break;
            case 'square':
                if (startPoint) {
                    const width = point.x - startPoint.x;
                    const height = point.y - startPoint.y;
                    const preview: SquareElement = {
                        id: 'preview',
                        type: 'square',
                        color: activeColor,
                        selected: false,
                        x: width >= 0 ? startPoint.x : point.x,
                        y: height >= 0 ? startPoint.y : point.y,
                        width: Math.abs(width),
                        height: Math.abs(height),
                        strokeWidth: DEFAULT_STROKE_WIDTH,
                    };
                    setPreviewElement(preview);
                }
                break;
            case 'circle':
                if (startPoint) {
                    const rx = Math.abs(point.x - startPoint.x);
                    const ry = Math.abs(point.y - startPoint.y);
                    const preview: CircleElement = {
                        id: 'preview',
                        type: 'circle',
                        color: activeColor,
                        selected: false,
                        cx: startPoint.x,
                        cy: startPoint.y,
                        rx,
                        ry,
                        strokeWidth: DEFAULT_STROKE_WIDTH,
                    };
                    setPreviewElement(preview);
                }
                break;
            case 'eraser':
                // Continue erasing elements
                const elementToErase = findElementAtPoint(point, history.elements);
                if (elementToErase) {
                    const filtered = history.elements.filter(el => el.id !== elementToErase.id);
                    history.set(filtered, false);
                }
                break;
            case 'select':
                // Handle resize
                if (activeResizeHandle && startPoint && resizeStartBounds) {
                    const deltaX = point.x - startPoint.x;
                    const deltaY = point.y - startPoint.y;

                    const updatedElements = history.elements.map(el => {
                        if (!el.selected) return el;

                        let newBounds = { ...resizeStartBounds };

                        switch (activeResizeHandle) {
                            case 'nw':
                                newBounds.x = resizeStartBounds.x + deltaX;
                                newBounds.y = resizeStartBounds.y + deltaY;
                                newBounds.width = resizeStartBounds.width - deltaX;
                                newBounds.height = resizeStartBounds.height - deltaY;
                                break;
                            case 'ne':
                                newBounds.y = resizeStartBounds.y + deltaY;
                                newBounds.width = resizeStartBounds.width + deltaX;
                                newBounds.height = resizeStartBounds.height - deltaY;
                                break;
                            case 'sw':
                                newBounds.x = resizeStartBounds.x + deltaX;
                                newBounds.width = resizeStartBounds.width - deltaX;
                                newBounds.height = resizeStartBounds.height + deltaY;
                                break;
                            case 'se':
                                newBounds.width = resizeStartBounds.width + deltaX;
                                newBounds.height = resizeStartBounds.height + deltaY;
                                break;
                        }

                        // Ensure minimum size
                        if (newBounds.width < 10) newBounds.width = 10;
                        if (newBounds.height < 10) newBounds.height = 10;

                        switch (el.type) {
                            case 'square':
                                return { ...el, x: newBounds.x, y: newBounds.y, width: newBounds.width, height: newBounds.height };
                            case 'circle':
                                return { ...el, cx: newBounds.x + newBounds.width / 2, cy: newBounds.y + newBounds.height / 2, rx: newBounds.width / 2, ry: newBounds.height / 2 };
                            case 'dot':
                                const newRadius = Math.min(newBounds.width, newBounds.height) / 2;
                                return { ...el, x: newBounds.x + newBounds.width / 2, y: newBounds.y + newBounds.height / 2, radius: Math.max(2, newRadius) };
                            case 'pen':
                                // Scale pen points proportionally
                                const oldBounds = getElementBounds(el);
                                if (oldBounds.width === 0 || oldBounds.height === 0) return el;
                                const scaleX = newBounds.width / oldBounds.width;
                                const scaleY = newBounds.height / oldBounds.height;
                                const newPoints = el.points.map(p => ({
                                    ...p,
                                    x: newBounds.x + (p.x - oldBounds.x) * scaleX,
                                    y: newBounds.y + (p.y - oldBounds.y) * scaleY,
                                }));
                                const stroke = getStroke(newPoints.map(p => [p.x, p.y, p.pressure ?? 0.5]), STROKE_OPTIONS);
                                return { ...el, points: newPoints, pathData: getSvgPathFromStroke(stroke) };
                            default:
                                return el;
                        }
                    });
                    history.set(updatedElements, false);
                    return;
                }

                // Handle drag
                if (selectedIdRef.current && dragOffset) {
                    const updatedElements = history.elements.map(el => {
                        if (el.id !== selectedIdRef.current) return el;

                        const newX = point.x - dragOffset.x;
                        const newY = point.y - dragOffset.y;

                        switch (el.type) {
                            case 'dot':
                                return { ...el, x: newX, y: newY };
                            case 'square':
                                return { ...el, x: newX, y: newY };
                            case 'circle':
                                return { ...el, cx: newX, cy: newY };
                            case 'pen':
                                const deltaX = newX - el.points[0].x;
                                const deltaY = newY - el.points[0].y;
                                const newPoints = el.points.map(p => ({
                                    ...p,
                                    x: p.x + deltaX,
                                    y: p.y + deltaY,
                                }));
                                const stroke = getStroke(newPoints.map(p => [p.x, p.y, p.pressure ?? 0.5]), STROKE_OPTIONS);
                                return {
                                    ...el,
                                    points: newPoints,
                                    pathData: getSvgPathFromStroke(stroke),
                                };
                            default:
                                return el;
                        }
                    });
                    history.set(updatedElements, false);
                }
                break;
        }
    }, [isDrawing, activeTool, startPoint, activeColor, getPointerPosition, history, dragOffset, activeResizeHandle, resizeStartBounds, findElementAtPoint, getElementBounds]);

    const handlePointerUp = useCallback(() => {
        if (!isDrawing && !activeResizeHandle) return;

        switch (activeTool) {
            case 'pen':
                if (currentStroke.length > 1) {
                    const stroke = getStroke(currentStroke.map(p => [p.x, p.y, p.pressure ?? 0.5]), STROKE_OPTIONS);
                    const pathData = getSvgPathFromStroke(stroke);
                    const newPen: PenElement = {
                        id: generateId(),
                        type: 'pen',
                        color: activeColor,
                        selected: false,
                        points: currentStroke,
                        pathData,
                    };
                    history.set([...history.elements, newPen]);
                }
                setCurrentStroke([]);
                break;
            case 'square':
                if (previewElement && previewElement.type === 'square') {
                    const newSquare: SquareElement = {
                        ...previewElement,
                        id: generateId(),
                    };
                    history.set([...history.elements, newSquare]);
                }
                setPreviewElement(null);
                setStartPoint(null);
                break;
            case 'circle':
                if (previewElement && previewElement.type === 'circle') {
                    const newCircle: CircleElement = {
                        ...previewElement,
                        id: generateId(),
                    };
                    history.set([...history.elements, newCircle]);
                }
                setPreviewElement(null);
                setStartPoint(null);
                break;
            case 'eraser':
                // Record eraser changes in history
                history.set([...history.elements], true);
                break;
            case 'select':
                if (activeResizeHandle) {
                    // Record resize in history
                    history.set([...history.elements], true);
                    setActiveResizeHandle(null);
                    setResizeStartBounds(null);
                    setStartPoint(null);
                } else if (selectedIdRef.current && dragOffset) {
                    history.set([...history.elements], true);
                }
                setDragOffset(null);
                break;
        }

        setIsDrawing(false);
    }, [isDrawing, activeTool, currentStroke, previewElement, activeColor, history, dragOffset, activeResizeHandle]);

    const handlePointerLeave = useCallback(() => {
        if (isDrawing || activeResizeHandle) {
            handlePointerUp();
        }
    }, [isDrawing, activeResizeHandle, handlePointerUp]);

    const deleteSelected = useCallback(() => {
        const selectedElement = history.elements.find(el => el.selected);
        if (selectedElement) {
            const filtered = history.elements.filter(el => !el.selected);
            history.set(filtered);
            selectedIdRef.current = null;
        }
    }, [history]);

    const deselectAll = useCallback(() => {
        const hasSelection = history.elements.some(el => el.selected);
        if (hasSelection) {
            const deselected = history.elements.map(el => ({ ...el, selected: false }));
            history.set(deselected, false);
            selectedIdRef.current = null;
        }
    }, [history]);

    const getCurrentStrokePath = useCallback((): string => {
        if (currentStroke.length < 2) return '';
        const stroke = getStroke(currentStroke.map(p => [p.x, p.y, p.pressure ?? 0.5]), STROKE_OPTIONS);
        return getSvgPathFromStroke(stroke);
    }, [currentStroke]);

    const exportToSVG = useCallback((): string => {
        const svgContent = history.elements.map(el => {
            switch (el.type) {
                case 'pen':
                    return `<path d="${el.pathData}" fill="${el.color}" />`;
                case 'dot':
                    return `<circle cx="${el.x}" cy="${el.y}" r="${el.radius}" fill="${el.color}" />`;
                case 'square':
                    return `<rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" fill="none" stroke="${el.color}" stroke-width="${el.strokeWidth}" />`;
                case 'circle':
                    return `<ellipse cx="${el.cx}" cy="${el.cy}" rx="${el.rx}" ry="${el.ry}" fill="none" stroke="${el.color}" stroke-width="${el.strokeWidth}" />`;
            }
        }).join('\n  ');

        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" width="300" height="300">
  ${svgContent}
</svg>`;
    }, [history.elements]);

    return {
        // State
        elements: history.elements,
        activeTool,
        activeColor,
        isDrawing,
        currentStroke,
        previewElement,
        activeResizeHandle,

        // Actions
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

        // History
        undo: history.undo,
        redo: history.redo,
        clear: history.clear,
        canUndo: history.canUndo,
        canRedo: history.canRedo,
    };
}
