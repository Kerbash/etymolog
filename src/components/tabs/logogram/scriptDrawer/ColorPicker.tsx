import classNames from 'classnames';
import { PRESET_COLORS } from './types';
import styles from './scriptDrawer.module.scss';

interface ColorPickerProps {
    activeColor: string;
    onColorChange: (color: string) => void;
}

export default function ColorPicker({ activeColor, onColorChange }: ColorPickerProps) {
    return (
        <div className={styles.colorPicker}>
            <span className={styles.label}>Color:</span>
            {PRESET_COLORS.map(color => (
                <button
                    key={color.name}
                    className={classNames(
                        styles.colorSwatch,
                        activeColor === color.value && styles.colorSwatchActive
                    )}
                    style={{ backgroundColor: color.value }}
                    onClick={() => onColorChange(color.value)}
                    title={color.name}
                />
            ))}
        </div>
    );
}
