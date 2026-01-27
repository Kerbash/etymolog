/**
 * LexiconHome
 * ----------------
 * Main view for the Lexicon tab showing the gallery with navigation.
 */

import { useNavigate, Link } from 'react-router-dom';
import { useCallback, useMemo } from 'react';
import { useEtymolog } from '../../../db';
import { LexiconGallery } from './galleryLexicon';
import type { LexiconComplete } from '../../../db/types';
import IconButton from 'cyber-components/interactable/buttons/iconButton/iconButton.tsx';
import { buttonStyles } from 'cyber-components/interactable/buttons/button/button.tsx';
import classNames from 'classnames';
import { flex, sizing } from "utils-styles";

export default function LexiconHome() {
    const navigate = useNavigate();
    const { data, isLoading, error } = useEtymolog();

    // Get lexicon data and build grapheme map
    const lexicons = data.lexiconComplete ?? [];

    // Build a map of grapheme ID to GraphemeComplete for SVG lookup
    const graphemeMap = useMemo(() => {
        const map = new Map();
        for (const grapheme of data.graphemeComplete ?? []) {
            map.set(grapheme.id, grapheme);
        }
        return map;
    }, [data.graphemeComplete]);

    // Handle lexicon click - navigate to view page
    const handleLexiconClick = useCallback((lexicon: LexiconComplete) => {
        navigate(`/lexicon/db/${lexicon.id}`);
    }, [navigate]);

    return (
        <div className={classNames(flex.flexColumn, sizing.parentSize)} style={{ gap: '1rem' }}>
            {/* Header with title and create button */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0 0.5rem',
            }}>
                <h2 style={{ margin: 0 }}>Lexicon</h2>
                <IconButton
                    as={Link}
                    to="/lexicon/create"
                    iconName="plus-lg"
                    className={buttonStyles.primary}
                >
                    New Word
                </IconButton>
            </div>

            {/* Gallery */}
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                <LexiconGallery
                    lexicons={lexicons}
                    graphemeMap={graphemeMap}
                    isLoading={isLoading}
                    error={error}
                    onLexiconClick={handleLexiconClick}
                />
            </div>
        </div>
    );
}
