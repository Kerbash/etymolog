/**
 * PNG Frame — Decorative PNG Wrapper for Pixel-Encoded Data
 *
 * Wraps the raw data pixel grid inside a visually appealing PNG image with a
 * dark background, accent border, conlang name label, and "Etymolog / by Kerbash"
 * branding. The data pixels are placed at a fixed offset using `putImageData`
 * (which bypasses compositing, preserving exact byte values through the PNG
 * lossless round-trip).
 *
 * A 3-pixel metadata header is embedded at position (0,0) of the final image
 * to store the data region dimensions. This allows the import side to locate
 * and extract the data pixels from the decorated frame without scanning.
 *
 * Layout of the framed PNG:
 *
 *   ┌─────────────────────────────────────────┐
 *   │  (0,0) metadata pixels (3px)            │  ← row 0 (part of dark bg)
 *   │  ...dark background...                  │
 *   │  ConlangName              (top-left)    │  ← y ≈ topPad - 16
 *   ├─────────────────────────────────────────┤
 *   │                                         │
 *   │    ┌─── data pixels ───┐                │  ← starts at (PADDING, TOP_PAD)
 *   │    │   (exact values   │                │
 *   │    │    via putImgData) │                │
 *   │    └───────────────────┘                │
 *   │                                         │
 *   │                          Etymolog       │  ← bottom-right labels
 *   │                          by Kerbash     │
 *   └─────────────────────────────────────────┘
 *
 * Metadata header (first 3 pixels of row 0):
 *   Pixel 0: R=0x45 G=0x58 B=0x50 A=0xFF  ("EXP" marker)
 *   Pixel 1: R=dataW>>8  G=dataW&0xFF  B=dataH>>8  A=0xFF
 *   Pixel 2: R=dataH&0xFF  G=0x00  B=0x00  A=0xFF
 */

/** Horizontal padding around the data image (left and right). */
const PADDING = 20;

/** Vertical padding above the data image (space for conlang name text). */
const TOP_PAD = 48;

/** Vertical padding below the data image (space for branding labels). */
const BOTTOM_PAD = 48;

/**
 * The frame is never smaller than this, on either axis, and it is always
 * SQUARE.
 *
 * The frame used to be `data + padding` on each axis, which is exactly right
 * for a conlang with a few hundred words and exactly wrong for a new one: an
 * empty conlang encodes to a ~20 px data block, so the whole export was a
 * ~60×116 thumbnail with "Etymolog / by Kerbash" clipped off its right edge
 * and the conlang name running off the top. A floor makes the labels legible
 * for every export; a square makes the file look like the one deliberate
 * artefact it is (a share card) rather than a strip whose shape depends on how
 * many words you have written.
 */
export const MIN_FRAME_SIZE = 512;

/**
 * Frame layout revision stored in the metadata header (pixel 2, G channel).
 *
 *  - `0` — the original layout: the data block sits at the fixed offset
 *    `(PADDING, TOP_PAD)`. Every export made before the square frame has this
 *    (the byte was simply unused and zero), so a reader that sees `0` must use
 *    the fixed offset and MUST NOT look for pixels 3–4.
 *  - `1` — the square frame: the data block is centred and its offset is
 *    stored in metadata pixels 3 and 4.
 */
export const FRAME_LAYOUT_VERSION = 1;

/** 3-byte marker at pixel (0,0) identifying an Etymolog framed PNG: ASCII "EXP". */
const META_MARKER = [0x45, 0x58, 0x50] as const;

/** Number of metadata pixels written in row 0 (marker, dims, dims+version, offset, offset). */
const META_PIXELS = 5;

/** Everything the painter and the reader need to agree on about one frame. */
export interface FrameLayout {
    /** Side of the square canvas. */
    size: number;
    /** Top-left corner of the data block inside the canvas. */
    dataX: number;
    dataY: number;
    /** Data block dimensions, echoed for convenience. */
    dataW: number;
    dataH: number;
}

/**
 * Where a data block of `imgW × imgH` goes, and how big the frame must be.
 *
 * The side is the largest of: the floor, the data plus horizontal padding, and
 * the data plus the two label bands — so a conlang too big for the floor still
 * gets a frame that fits it, and the frame stays square either way. The block
 * is centred in the area BETWEEN the label bands (not the whole canvas), so it
 * can never run under the name or the branding. Offsets are whole pixels:
 * `putImageData` takes integers, and a fractional offset would make the reader
 * and the painter disagree by a pixel.
 */
export function computeFrameLayout(imgW: number, imgH: number): FrameLayout {
    if (!Number.isInteger(imgW) || !Number.isInteger(imgH) || imgW <= 0 || imgH <= 0) {
        throw new Error(`Invalid data image dimensions: ${imgW}×${imgH}`);
    }
    const size = Math.max(MIN_FRAME_SIZE, imgW + PADDING * 2, imgH + TOP_PAD + BOTTOM_PAD);
    const dataX = Math.floor((size - imgW) / 2);
    const dataY = TOP_PAD + Math.floor((size - TOP_PAD - BOTTOM_PAD - imgH) / 2);
    return { size, dataX, dataY, dataW: imgW, dataH: imgH };
}

/**
 * Encode the metadata header for a layout: `META_PIXELS` RGBA pixels.
 *
 *   Pixel 0: R=0x45 G=0x58 B=0x50            "EXP" marker
 *   Pixel 1: R=dataW>>8  G=dataW&0xFF  B=dataH>>8
 *   Pixel 2: R=dataH&0xFF  G=FRAME_LAYOUT_VERSION  B=0
 *   Pixel 3: R=dataX>>8  G=dataX&0xFF  B=dataY>>8      (layout ≥ 1 only)
 *   Pixel 4: R=dataY&0xFF  G=0  B=0                    (layout ≥ 1 only)
 *
 * Alpha is 255 everywhere: a canvas with premultiplied alpha would otherwise
 * be free to round the colour channels of a translucent pixel.
 */
export function encodeFrameMetadata(layout: FrameLayout): Uint8ClampedArray {
    const d = new Uint8ClampedArray(META_PIXELS * 4);
    d[0] = META_MARKER[0]; d[1] = META_MARKER[1]; d[2] = META_MARKER[2]; d[3] = 255;
    d[4] = (layout.dataW >> 8) & 0xFF; d[5] = layout.dataW & 0xFF; d[6] = (layout.dataH >> 8) & 0xFF; d[7] = 255;
    d[8] = layout.dataH & 0xFF; d[9] = FRAME_LAYOUT_VERSION; d[10] = 0; d[11] = 255;
    d[12] = (layout.dataX >> 8) & 0xFF; d[13] = layout.dataX & 0xFF; d[14] = (layout.dataY >> 8) & 0xFF; d[15] = 255;
    d[16] = layout.dataY & 0xFF; d[17] = 0; d[18] = 0; d[19] = 255;
    return d;
}

/**
 * Read the metadata header back out of a frame's pixels and locate the data
 * block, for BOTH layout revisions.
 *
 * @throws Error when the marker is missing or the block does not fit inside
 *   the image — a truncated or re-encoded file, not an Etymolog export.
 */
export function readFrameMetadata(
    fullPixels: Uint8ClampedArray,
    fullW: number,
    fullH: number,
): FrameLayout {
    if (
        fullPixels[0] !== META_MARKER[0] ||
        fullPixels[1] !== META_MARKER[1] ||
        fullPixels[2] !== META_MARKER[2]
    ) {
        throw new Error('Not a valid Etymolog image: missing metadata marker');
    }

    const dataW = (fullPixels[4] << 8) | fullPixels[5];
    const dataH = (fullPixels[6] << 8) | fullPixels[8];
    const layoutVersion = fullPixels[9];

    let dataX = PADDING;
    let dataY = TOP_PAD;
    if (layoutVersion >= 1) {
        dataX = (fullPixels[12] << 8) | fullPixels[13];
        dataY = (fullPixels[14] << 8) | fullPixels[16];
    }

    if (dataW <= 0 || dataH <= 0 || dataX + dataW > fullW || dataY + dataH > fullH) {
        throw new Error('Invalid Etymolog image: data dimensions out of bounds');
    }

    return { size: Math.max(fullW, fullH), dataX, dataY, dataW, dataH };
}

/**
 * Copy the data block out of a frame's pixels. Pure, so the reader can be
 * tested without a canvas; `extractDataFromPngFrame` is the canvas-backed
 * wrapper around it.
 */
export function extractDataRegion(
    fullPixels: Uint8ClampedArray,
    fullW: number,
    layout: FrameLayout,
): Uint8ClampedArray {
    const { dataX, dataY, dataW, dataH } = layout;
    const dataPixels = new Uint8ClampedArray(dataW * dataH * 4);
    for (let y = 0; y < dataH; y++) {
        const srcRow = ((y + dataY) * fullW + dataX) * 4;
        const dstRow = y * dataW * 4;
        dataPixels.set(fullPixels.subarray(srcRow, srcRow + dataW * 4), dstRow);
    }
    return dataPixels;
}

/**
 * The conlang name, shortened with an ellipsis until it fits `maxWidth` in the
 * current canvas font. A name wider than the frame used to run straight off
 * the right edge; a 512 px frame holds ~49 monospace characters, which is
 * plenty for a name and not for a sentence.
 */
export function fitLabel(
    measure: (text: string) => number,
    text: string,
    maxWidth: number,
): string {
    if (measure(text) <= maxWidth) return text;
    const chars = Array.from(text);
    while (chars.length > 0) {
        chars.pop();
        const candidate = `${chars.join('').trimEnd()}…`;
        if (measure(candidate) <= maxWidth) return candidate;
    }
    return '…';
}

/**
 * Wrap raw data pixel data inside a decorative PNG frame.
 *
 * Creates an HTML canvas with a dark background, draws decorative elements
 * (border, conlang name, branding text), then places the data pixels at
 * the known offset (PADDING, TOP_PAD) using `putImageData` for exact byte
 * preservation. Finally, embeds a 3-pixel metadata header at (0,0) encoding
 * the data image dimensions, and exports the canvas as a PNG Blob.
 *
 * The data pixels must come from `imageCodec.jsonToPixelData()` — they contain
 * the gzip-compressed, CRC-protected, marker-delimited binary payload.
 *
 * @param pixels      — RGBA pixel data of the encoded data image (Uint8ClampedArray)
 * @param imgW        — width of the data image in pixels
 * @param imgH        — height of the data image in pixels
 * @param conlangName — the conlang name to display in the top-left corner
 * @returns a Promise resolving to a PNG Blob ready for download
 */
export async function wrapInPngFrame(
    pixels: Uint8ClampedArray<ArrayBuffer>,
    imgW: number,
    imgH: number,
    conlangName: string
): Promise<Blob> {
    const layout = computeFrameLayout(imgW, imgH);
    const { size, dataX, dataY } = layout;

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // 1. Dark background
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, size, size);

    // 2. Accent border
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(2, 2, size - 4, size - 4);

    // 3. Conlang name label (top-left), shortened if it would leave the frame
    ctx.font = '16px monospace';
    ctx.fillStyle = '#00d4ff';
    ctx.textAlign = 'left';
    const nameLabel = fitLabel(
        (text) => ctx.measureText(text).width,
        conlangName || 'Untitled conlang',
        size - PADDING * 2,
    );
    ctx.fillText(nameLabel, PADDING, TOP_PAD - 16);

    // 4. Branding labels (bottom-right)
    ctx.font = '12px monospace';
    ctx.fillStyle = '#888888';
    ctx.textAlign = 'right';
    ctx.fillText('Etymolog', size - PADDING, size - BOTTOM_PAD + 20);
    ctx.font = '10px monospace';
    ctx.fillStyle = '#666666';
    ctx.fillText('by Kerbash', size - PADDING, size - BOTTOM_PAD + 36);

    // 5. A hairline around the data block, OUTSIDE it, so a small block on a
    //    large frame reads as "the data" rather than a stray smudge. Drawn
    //    before the block: anti-aliasing can only ever bleed into pixels the
    //    block is about to overwrite, never into pixels the reader will trust.
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.25)';
    ctx.strokeRect(dataX - 2.5, dataY - 2.5, imgW + 5, imgH + 5);

    // 6. Place data pixels exactly (putImageData bypasses canvas compositing,
    //    so every RGB value is written verbatim — critical for lossless round-trip)
    const dataImageData = new ImageData(pixels, imgW, imgH);
    ctx.putImageData(dataImageData, dataX, dataY);

    // 7. Embed the metadata header in row 0. It overwrites a few pixels of the
    //    dark background in the top-left corner, invisible at this size, and
    //    tells the reader where the (now centred) block is.
    const meta = ctx.getImageData(0, 0, META_PIXELS, 1);
    meta.data.set(encodeFrameMetadata(layout));
    ctx.putImageData(meta, 0, 0);

    // 7. Export canvas as PNG Blob
    return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
            (blob) => blob ? resolve(blob) : reject(new Error('Failed to create PNG')),
            'image/png'
        );
    });
}

/**
 * Extract the raw data pixel region from a decorated Etymolog PNG.
 *
 * Loads the PNG file into an Image element, draws it onto a canvas to access
 * pixel data, then reads the 3-pixel metadata header at (0,0) to determine
 * the data image dimensions and location. Extracts the rectangular data region
 * from position (PADDING, TOP_PAD) and returns it as a standalone pixel array.
 *
 * The returned pixels can be passed directly to `imageCodec.pixelDataToJson()`
 * to recover the original JSON string.
 *
 * @param file — the PNG file (Blob or File) containing a framed Etymolog export
 * @returns a Promise resolving to `{ pixels, width, height }` of the data region
 * @throws Error if the file is not a valid Etymolog PNG (missing "EXP" marker)
 */
export async function extractDataFromPngFrame(file: Blob): Promise<{
    pixels: Uint8ClampedArray;
    width: number;
    height: number;
}> {
    // Load the PNG onto a canvas to read pixel data
    const dataUrl = await blobToDataUrl(file);
    const { fullW, fullH, fullPixels } = await loadImagePixels(dataUrl);

    // The header says where the block is — at the fixed legacy offset for
    // exports made before the square frame, at the stored offset since.
    const layout = readFrameMetadata(fullPixels, fullW, fullH);
    const dataPixels = extractDataRegion(fullPixels, fullW, layout);

    return { pixels: dataPixels, width: layout.dataW, height: layout.dataH };
}

/**
 * Load a data URL as an Image, draw to canvas, and return the raw RGBA pixels.
 * PNG is lossless so all pixel values survive the encode → decode round-trip.
 */
function loadImagePixels(dataUrl: string): Promise<{
    fullW: number;
    fullH: number;
    fullPixels: Uint8ClampedArray;
}> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return reject(new Error('Failed to get canvas context'));
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, img.width, img.height);
            resolve({ fullW: img.width, fullH: img.height, fullPixels: imageData.data });
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = dataUrl;
    });
}

/** Convert a Blob/File to a data: URL via FileReader. */
function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(blob);
    });
}
