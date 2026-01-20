import classNames from 'classnames';
import styles from './scriptDrawer.module.scss';

interface ActionBarProps {
    canUndo: boolean;
    canRedo: boolean;
    hasSelection: boolean;
    onUndo: () => void;
    onRedo: () => void;
    onClear: () => void;
    onDelete: () => void;
    onExport: () => void;
}

export default function ActionBar({
    canUndo,
    canRedo,
    hasSelection,
    onUndo,
    onRedo,
    onClear,
    onDelete,
    onExport,
}: ActionBarProps) {
    return (
        <div className={styles.actionBar}>
            <button
                className={styles.actionButton}
                onClick={onUndo}
                disabled={!canUndo}
            >
                Undo
            </button>
            <button
                className={styles.actionButton}
                onClick={onRedo}
                disabled={!canRedo}
            >
                Redo
            </button>
            <button
                className={classNames(styles.actionButton, styles.actionButtonDanger)}
                onClick={onDelete}
                disabled={!hasSelection}
            >
                Delete
            </button>
            <button
                className={classNames(styles.actionButton, styles.actionButtonDanger)}
                onClick={onClear}
            >
                Clear
            </button>
            <button
                className={styles.actionButton}
                onClick={onExport}
            >
                Export SVG
            </button>
        </div>
    );
}
