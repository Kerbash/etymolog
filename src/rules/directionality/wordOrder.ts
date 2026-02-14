import type { TypographyRule } from '../types';

export const wordOrderRule: TypographyRule = {
    key: 'wordOrder',
    label: 'Word Order',
    description: 'How words flow in a sentence or line',
    category: 'Directionality',
    options: [
        { value: 'ltr', label: 'Left to Right', description: 'Words flow left to right' },
        { value: 'rtl', label: 'Right to Left', description: 'Words flow right to left' },
        { value: 'ttb', label: 'Top to Bottom', description: 'Words flow top to bottom' },
        { value: 'btu', label: 'Bottom to Up', description: 'Words flow bottom to top' },
    ],
    defaultValue: 'ltr',
    priority: 2,
};
