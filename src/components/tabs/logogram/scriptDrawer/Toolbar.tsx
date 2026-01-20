import classNames from 'classnames';
import type { Tool } from './types';
import styles from './scriptDrawer.module.scss';

interface ToolbarProps {
    activeTool: Tool;
    onToolChange: (tool: Tool) => void;
}

const TOOLS: { id: Tool; label: string }[] = [
    { id: 'pen', label: 'Pen' },
    { id: 'dot', label: 'Dot' },
    { id: 'square', label: 'Square' },
    { id: 'circle', label: 'Circle' },
    { id: 'select', label: 'Select' },
    { id: 'eraser', label: 'Eraser' },
];

export default function Toolbar({ activeTool, onToolChange }: ToolbarProps) {
    return (
        <div className={styles.toolbar}>
            {TOOLS.map(tool => (
                <button
                    key={tool.id}
                    className={classNames(
                        styles.toolButton,
                        activeTool === tool.id && styles.toolButtonActive
                    )}
                    onClick={() => onToolChange(tool.id)}
                >
                    {tool.label}
                </button>
            ))}
        </div>
    );
}
