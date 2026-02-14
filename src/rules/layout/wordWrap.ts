import type { TypographyRule } from '../types';

export const wordWrapRule: TypographyRule = {
    key: 'wordWrap',
    label: 'Word Wrap',
    description: 'How text wraps when reaching the edge',
    category: 'Layout',
    options: [
        { value: 'word', label: 'Word Boundary', description: 'Wrap at word boundaries — words stay intact' },
        { value: 'glyph', label: 'Glyph Boundary', description: 'Wrap at any glyph — words may split across lines' },
        { value: 'none', label: 'None', description: 'No wrapping — text extends beyond the edge' },
    ],
    defaultValue: 'word',
    priority: 5,
};
