import { useGlyphs } from '../../../../db';
import classNames from 'classnames';
import { flex } from 'utils-styles';
import HoverToolTip from 'cyber-components/interactable/information/hoverToolTip/hoverToolTip';

/**
 * Simple glyph gallery: name on top, SVG in the middle.
 * Minimal styling so it matches the rest of the app's layout.
 */
export default function GlyphGallery() {
    const { glyphsWithUsage, isLoading, error } = useGlyphs();

    if (isLoading) return <div>Loading glyphs...</div>;
    if (error) return <div>Error loading glyphs: {error.message}</div>;
    if (!glyphsWithUsage || glyphsWithUsage.length === 0) {
        return <div>No glyphs found. Create one to get started.</div>;
    }

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '1rem' }}>
            {glyphsWithUsage.map((g) => {
                const usage = g.usageCount ?? 0;
                const usageText = usage === 0 ? 'Not used' : `Used by ${usage} grapheme${usage === 1 ? '' : 's'}`;

                return (
                    <HoverToolTip key={g.id} content={usageText}>
                        <div
                            className={classNames(flex.flexColumn)}
                            style={{
                                alignItems: 'center',
                                textAlign: 'center',
                                padding: '0.5rem',
                                border: '1px solid var(--border-primary)',
                                borderRadius: 8,
                                background: 'var(--surface-base)'
                            }}
                        >
                            <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>{g.name}</div>
                            <div style={{ width: '100%', height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }} dangerouslySetInnerHTML={{ __html: g.svg_data }} />
                        </div>
                    </HoverToolTip>
                );
            })}
        </div>
    );
}
