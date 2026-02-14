import type { TypographyRule } from '../types';

export const lineProgressionRule: TypographyRule = {
    key: 'lineProgression',
    label: 'Line Progression',
    description: 'Where new lines go when wrapping',
    category: 'Directionality',
    options: [
        { value: 'ttb', label: 'Top to Bottom', description: 'New lines appear below (standard for horizontal scripts)' },
        { value: 'btu', label: 'Bottom to Up', description: 'New lines appear above' },
        { value: 'ltr', label: 'Left to Right', description: 'New columns to the right (traditional CJK column style)' },
        { value: 'rtl', label: 'Right to Left', description: 'New columns to the left' },
    ],
    defaultValue: 'ttb',
    priority: 3,
};
