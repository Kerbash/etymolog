// @ts-nocheck
/**
 * GlyphCanvasInput Component Tests
 *
 * NOTE: These tests require @testing-library/react which is not currently installed.
 * Tests are skipped until the dependency is added.
 *
 * To run these tests, install: pnpm add -D @testing-library/react @testing-library/jest-dom
 */
import { describe, it } from 'vitest';

describe.skip('GlyphCanvasInput', () => {
  it('calls onSelectionChange when setValue is used (happy path)', async () => {
    // Test implementation requires @testing-library/react
    // See comment at top of file
  });

  it('provides glyph_order format in onSelectionChange callback', async () => {
    // When using Two-List Architecture, onSelectionChange should receive
    // (ids: number[], hasVirtualGlyphs: boolean, glyphOrder: SpellingEntry[])
  });

  it('initializes from initialGlyphOrder prop', async () => {
    // When initialGlyphOrder is provided, component should parse it and
    // create virtual glyphs for IPA characters
  });
});
