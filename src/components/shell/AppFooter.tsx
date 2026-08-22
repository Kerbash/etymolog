import BasicFooter from 'cyber-components/layout/basic/footer/footer';

import { formatBuildStamp } from '../../config/version';
import { PersistenceStatusText } from './PersistenceStatus';
import styles from './AppFooter.module.scss';

/**
 * AppFooter — the `<footer>` landmark: what build this is, who made it, and
 * whether the work is safely on disk.
 *
 * The save indicator lives here rather than in the header because it is
 * ambient: it changes constantly and must never compete for attention with the
 * page. Anything that needs ACTION escalates to `ShellStatusBanner` instead.
 */
export default function AppFooter() {
    return (
        <BasicFooter className={styles.footer}>
            <div className={styles.inner}>
                <span className={styles.build}>
                    {/* Full build stamp (version · commit · build time) rather
                        than the bare version: "which build is this?" is
                        unanswerable from a semver alone once two builds share
                        it. See VERSIONING.md. */}
                    Etymolog {formatBuildStamp()} — an open-source conlang lexicon and script
                    management tool.
                </span>
                <span className={styles.meta}>
                    <PersistenceStatusText />
                    <span className={styles.author}>By Kerbash</span>
                </span>
            </div>
        </BasicFooter>
    );
}
