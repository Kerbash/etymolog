export type Tool = 'pen' | 'dot' | 'square' | 'circle' | 'select' | 'eraser';

export type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se' | null;

export interface Point {
    x: number;
    y: number;
    pressure?: number;
}

export interface BaseElement {
    id: string;
    type: Tool;
    color: string;
    selected: boolean;
}

export interface PenElement extends BaseElement {
    type: 'pen';
    points: Point[];
    pathData: string;
}

export interface DotElement extends BaseElement {
    type: 'dot';
    x: number;
    y: number;
    radius: number;
}

export interface SquareElement extends BaseElement {
    type: 'square';
    x: number;
    y: number;
    width: number;
    height: number;
    strokeWidth: number;
}

export interface CircleElement extends BaseElement {
    type: 'circle';
    cx: number;
    cy: number;
    rx: number;
    ry: number;
    strokeWidth: number;
}

export type DrawingElement = PenElement | DotElement | SquareElement | CircleElement;

export interface DrawingState {
    elements: DrawingElement[];
    activeTool: Tool;
    activeColor: string;
    isDrawing: boolean;
    currentStroke: Point[];
    startPoint: Point | null;
}

export const PRESET_COLORS = [
    { name: 'black', value: 'var(--black)' },
    { name: 'white', value: 'var(--white)' },
    { name: 'red', value: 'var(--red)' },
    { name: 'blue', value: 'var(--blue)' },
    { name: 'green', value: 'var(--green)' },
    { name: 'yellow', value: 'var(--yellow)' },
    { name: 'purple', value: 'var(--purple)' },
    { name: 'orange', value: 'var(--orange)' },
    { name: 'pink', value: 'var(--pink)' },
    { name: 'teal', value: 'var(--teal)' },
    { name: 'cyan', value: 'var(--cyan)' },
] as const;
