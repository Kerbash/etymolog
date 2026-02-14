import type { TypographyRule } from '../types';

export const glyphDirectionRule: TypographyRule = {
    key: 'glyphDirection',
    label: 'Glyph Direction',
    description: 'How glyphs flow within a word',
    category: 'Directionality',
    options: [
        { value: 'ltr', label: 'Left to Right', description: 'Glyphs flow left to right (e.g. Latin, Cyrillic)' },
        { value: 'rtl', label: 'Right to Left', description: 'Glyphs flow right to left (e.g. Arabic, Hebrew)' },
        { value: 'ttb', label: 'Top to Bottom', description: 'Glyphs flow top to bottom (e.g. traditional CJK)' },
        { value: 'btu', label: 'Bottom to Up', description: 'Glyphs flow bottom to top' },
    ],
    defaultValue: 'ltr',
    priority: 1,
};
