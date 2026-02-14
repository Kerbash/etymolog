import type { TypographyRule } from '../types';

export const glyphStackingRule: TypographyRule = {
    key: 'glyphStacking',
    label: 'Glyph Stacking',
    description: 'How multiple glyphs in a grapheme are arranged',
    category: 'Layout',
    options: [
        { value: 'horizontal', label: 'Horizontal', description: 'Glyphs stack side by side horizontally' },
        { value: 'vertical', label: 'Vertical', description: 'Glyphs stack on top of each other vertically' },
        { value: 'none', label: 'None', description: 'No stacking — glyphs overlap in place' },
    ],
    defaultValue: 'horizontal',
    priority: 4,
};
