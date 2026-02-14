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

/** 3-byte marker at pixel (0,0) identifying an Etymolog framed PNG: ASCII "EXP". */
const META_MARKER = [0x45, 0x58, 0x50] as const;

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
    pixels: Uint8ClampedArray,
    imgW: number,
    imgH: number,
    conlangName: string
): Promise<Blob> {
    const canvasW = imgW + PADDING * 2;
    const canvasH = imgH + TOP_PAD + BOTTOM_PAD;

    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d')!;

    // 1. Dark background
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // 2. Accent border
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(2, 2, canvasW - 4, canvasH - 4);

    // 3. Conlang name label (top-left)
    ctx.font = '16px monospace';
    ctx.fillStyle = '#00d4ff';
    ctx.textAlign = 'left';
    ctx.fillText(conlangName, PADDING, TOP_PAD - 16);

    // 4. Branding labels (bottom-right)
    ctx.font = '12px monospace';
    ctx.fillStyle = '#888888';
    ctx.textAlign = 'right';
    ctx.fillText('Etymolog', canvasW - PADDING, canvasH - BOTTOM_PAD + 20);
    ctx.font = '10px monospace';
    ctx.fillStyle = '#666666';
    ctx.fillText('by Kerbash', canvasW - PADDING, canvasH - BOTTOM_PAD + 36);

    // 5. Place data pixels exactly (putImageData bypasses canvas compositing,
    //    so every RGB value is written verbatim — critical for lossless round-trip)
    const dataImageData = new ImageData(pixels, imgW, imgH);
    ctx.putImageData(dataImageData, PADDING, TOP_PAD);

    // 6. Embed metadata in first 3 pixels of row 0
    //    This overwrites a tiny corner of the dark background (invisible at 3px)
    const meta = ctx.getImageData(0, 0, 3, 1);
    const d = meta.data;
    // Pixel 0: "EXP" marker
    d[0] = META_MARKER[0]; d[1] = META_MARKER[1]; d[2] = META_MARKER[2]; d[3] = 255;
    // Pixel 1: dataW (16-bit BE) + dataH high byte
    d[4] = (imgW >> 8) & 0xFF; d[5] = imgW & 0xFF; d[6] = (imgH >> 8) & 0xFF; d[7] = 255;
    // Pixel 2: dataH low byte
    d[8] = imgH & 0xFF; d[9] = 0; d[10] = 0; d[11] = 255;
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

    // Read metadata from first 3 pixels (12 bytes of RGBA data)
    if (
        fullPixels[0] !== META_MARKER[0] ||
        fullPixels[1] !== META_MARKER[1] ||
        fullPixels[2] !== META_MARKER[2]
    ) {
        throw new Error('Not a valid Etymolog image: missing metadata marker');
    }

    // Pixel 1: R=dataW high, G=dataW low, B=dataH high
    // Pixel 2: R=dataH low
    const dataW = (fullPixels[4] << 8) | fullPixels[5];
    const dataH = (fullPixels[6] << 8) | fullPixels[8];

    if (dataW <= 0 || dataH <= 0 || PADDING + dataW > fullW || TOP_PAD + dataH > fullH) {
        throw new Error('Invalid Etymolog image: data dimensions out of bounds');
    }

    // Extract the rectangular data region at (PADDING, TOP_PAD)
    const dataPixels = new Uint8ClampedArray(dataW * dataH * 4);
    for (let y = 0; y < dataH; y++) {
        for (let x = 0; x < dataW; x++) {
            const srcIdx = ((y + TOP_PAD) * fullW + (x + PADDING)) * 4;
            const dstIdx = (y * dataW + x) * 4;
            dataPixels[dstIdx] = fullPixels[srcIdx];
            dataPixels[dstIdx + 1] = fullPixels[srcIdx + 1];
            dataPixels[dstIdx + 2] = fullPixels[srcIdx + 2];
            dataPixels[dstIdx + 3] = fullPixels[srcIdx + 3];
        }
    }

    return { pixels: dataPixels, width: dataW, height: dataH };
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
