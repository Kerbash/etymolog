/**
 * Gzip Compression / Decompression
 *
 * Provides gzip compression and decompression using the browser-native
 * Compression Streams API (supported in all modern browsers). This is used
 * in the image export pipeline to shrink the JSON payload before encoding
 * it into pixel data, significantly reducing the resulting image size.
 *
 * The compression flow is:
 *   JSON string → UTF-8 bytes → gzip compress → pixel encode → PNG
 *
 * The decompression flow reverses this:
 *   PNG pixels → pixel decode → gzip decompress → UTF-8 bytes → JSON string
 */

/**
 * Gzip-compress a byte array.
 *
 * Pipes the input through a `CompressionStream('gzip')` and collects the
 * compressed output into a single contiguous `Uint8Array`. The output includes
 * the standard gzip header/footer and can be decompressed by any gzip-compatible tool.
 *
 * @param data — the raw bytes to compress
 * @returns a Promise resolving to the gzip-compressed bytes
 */
export async function compressData(data: Uint8Array): Promise<Uint8Array> {
    const cs = new CompressionStream('gzip');
    const writer = cs.writable.getWriter();
    writer.write(data);
    writer.close();

    const reader = cs.readable.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
    }
    return concatUint8Arrays(chunks);
}

/**
 * Gzip-decompress a byte array.
 *
 * Pipes the input through a `DecompressionStream('gzip')` and collects the
 * decompressed output into a single contiguous `Uint8Array`. Throws if the
 * input is not valid gzip data.
 *
 * @param data — the gzip-compressed bytes to decompress
 * @returns a Promise resolving to the decompressed bytes
 */
export async function decompressData(data: Uint8Array): Promise<Uint8Array> {
    const ds = new DecompressionStream('gzip');
    const writer = ds.writable.getWriter();
    writer.write(data);
    writer.close();

    const reader = ds.readable.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
    }
    return concatUint8Arrays(chunks);
}

/**
 * Concatenate multiple Uint8Arrays into a single contiguous array.
 * Used internally to collect streaming output from Compression/DecompressionStream.
 */
function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
    const totalLength = arrays.reduce((sum, a) => sum + a.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const arr of arrays) {
        result.set(arr, offset);
        offset += arr.length;
    }
    return result;
}
