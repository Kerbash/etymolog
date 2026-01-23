import { useGlyphs } from '../../../../db/useGlyphs';
import classNames from 'classnames';
import { flex } from 'utils-styles';

/**
 * Simple glyph gallery: name on top, SVG in the middle.
 * Minimal styling so it matches the rest of the app's layout.
 */
export default function GlyphGallery() {
    const { glyphs, isLoading, error } = useGlyphs();

    if (isLoading) return <div>Loading glyphs...</div>;
    if (error) return <div>Error loading glyphs: {error.message}</div>;
    if (!glyphs || glyphs.length === 0) {
        return <div>No glyphs found. Create one to get started.</div>;
    }

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '1rem' }}>
            {glyphs.map((g) => (
                <div
                    key={g.id}
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
            ))}
        </div>
    );
}
