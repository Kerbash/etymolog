import type { TypographyRule } from '../types';

export const baselineAlignmentRule: TypographyRule = {
    key: 'baselineAlignment',
    label: 'Baseline Alignment',
    description: 'How glyphs align within a line',
    category: 'Layout',
    options: [
        { value: 'bottom', label: 'Bottom', description: 'Glyphs sit on a shared baseline (standard)' },
        { value: 'center', label: 'Center', description: 'Glyphs are vertically centered within the line' },
        { value: 'top', label: 'Top', description: 'Glyphs hang from the top of the line' },
    ],
    defaultValue: 'bottom',
    priority: 6,
};
