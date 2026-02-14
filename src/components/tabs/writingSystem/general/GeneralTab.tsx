/**
 * Writing System - General Tab
 *
 * Displays all typography rules with their current values
 * and allows users to configure writing system behavior.
 */

import { useEtymolog } from '../../../../db/context/EtymologContext';
import WritingSystemTable from './WritingSystemTable';
import styles from '../writingSystem.module.scss';

export default function GeneralTab() {
    const { api, settings } = useEtymolog();

    const handleChange = (key: string, value: string) => {
        api.settings.update({
            writingSystem: {
                ...settings.writingSystem,
                [key]: value,
            },
        });
    };

    return (
        <div className={styles.container}>
            <p className={styles.description}>
                Define how your writing system flows directionally. These rules control glyph arrangement
                within words, word ordering within sentences, and line wrapping behavior.
            </p>

            <WritingSystemTable
                settings={settings.writingSystem}
                onChange={handleChange}
            />
        </div>
    );
}
