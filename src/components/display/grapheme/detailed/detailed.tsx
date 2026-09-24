import { useContext } from 'react';

import type { GraphemeComplete, VariantGroup } from '../../../../db/types.ts';
import { EtymologContext } from '../../../../db/context';
import { GlyphSpellingDisplay } from '../../spelling';
import styles from './detailed.module.scss';

interface DetailedGraphemeDisplayProps {
    graphemeData: GraphemeComplete;
}

const NO_GROUPS: VariantGroup[] = [];
const FORM_CONFIG = { glyphWidth: 40, glyphHeight: 40, spacing: 2, padding: 2 };

export default function DetailedGraphemeDisplay({ graphemeData }: DetailedGraphemeDisplayProps) {
    // Optional: a display rendered outside the provider simply has no group
    // names to show (the caption then says "no group").
    const context = useContext(EtymologContext);
    const groups = context ? context.data.variantGroups : NO_GROUPS;

    // `variants` absent ⇒ default form only (P5).
    const otherForms = (graphemeData.variants ?? []).filter((variant) => !variant.is_default);

    return (
        <div className={styles.display}>
            <div className={styles.left}>
                <div className={styles.svg}>
                    <GlyphSpellingDisplay
                        glyphs={graphemeData.glyphs}
                        strategy="ltr"
                        config={{ glyphWidth: 96, glyphHeight: 96, spacing: 4, padding: 8 }}
                        emptyContent={<span>No glyphs</span>}
                    />
                </div>
                <h2 className={styles.name}>{graphemeData.name}</h2>
                {graphemeData.glyphs.length > 1 && (
                    <span className={styles.glyphCount}>{graphemeData.glyphs.length} glyphs</span>
                )}
            </div>

            <div className={styles.right}>
                <h3 className={styles.pronunciationHeader}>Pronunciations</h3>
                <div className={styles.pronunciationList}>
                    {graphemeData.phonemes.length > 0 ? (
                        graphemeData.phonemes.map((phoneme) => (
                            <div key={phoneme.id} className={styles.pronunciationItem}>
                                <span className={styles.phonemeSymbol}>/{phoneme.phoneme}/</span>
                                {phoneme.context && (
                                    <span className={styles.phonemeContext}>{phoneme.context}</span>
                                )}
                                {phoneme.use_in_auto_spelling && (
                                    <span className={styles.autoSpellingBadge}>Auto</span>
                                )}
                            </div>
                        ))
                    ) : (
                        <p className={styles.noPhonemes}>No pronunciations defined</p>
                    )}
                </div>

                {otherForms.length > 0 && (
                    <>
                        <h3 className={styles.formsHeader}>Forms</h3>
                        <ul className={styles.formList} aria-label={`Other forms of ${graphemeData.name}`}>
                            {otherForms.map((variant) => {
                                const groupName =
                                    variant.group_id === null
                                        ? null
                                        : (groups.find((g) => g.id === variant.group_id)?.name ?? null);
                                return (
                                    <li key={variant.id} className={styles.formItem}>
                                        <div className={styles.formSvg}>
                                            {/* A plain Glyph[]: this input path never runs
                                                the block engine. */}
                                            <GlyphSpellingDisplay
                                                glyphs={variant.glyphs}
                                                strategy="ltr"
                                                config={FORM_CONFIG}
                                                emptyContent={<span>—</span>}
                                            />
                                        </div>
                                        <span className={styles.formCaption}>
                                            {variant.name} · {groupName ?? 'no group'}
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    </>
                )}
            </div>
        </div>
    );
}
