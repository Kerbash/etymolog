/**
 * A captioned screenshot in a guide walk-through. The image is a bundled local
 * asset (imported so Vite fingerprints it and respects the base path), so a
 * raw `<img>` is correct here — no CDN/media envelope involved.
 */

import styles from './GuidePage.module.scss';

export interface GuideFigureProps {
    src: string;
    alt: string;
    caption: string;
}

export default function GuideFigure({ src, alt, caption }: GuideFigureProps) {
    return (
        <figure className={styles.figure}>
            <img className={styles.figureImg} src={src} alt={alt} />
            <figcaption className={styles.figcaption}>{caption}</figcaption>
        </figure>
    );
}
