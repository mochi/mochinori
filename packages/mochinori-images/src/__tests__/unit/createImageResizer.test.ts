// @vitest-environment node
import {afterEach, describe, expect, it, vi} from 'vitest';

import {createImageResizer} from '../../index.ts';

const signal = new AbortController().signal;
// The extension's maxFileSize, passed to every preparer
const limit = {maxFileSize: 20_000, signal};

/**
 * Stubs createImageBitmap and OffscreenCanvas for a bitmap of this size.
 * An encoded image has one byte per `pixelsPerByte` pixels.
 */
function stubCanvas(
  width: number,
  height: number,
  pixelsPerByte = 1000,
  encodable = (type: string) => type !== 'image/avif',
) {
  const drawn: number[][] = [];
  const encoded: unknown[] = [];
  const contexts: unknown[] = [];
  const close = vi.fn();
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({close, height, width})),
  );
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      size: [number, number];
      constructor(...size: [number, number]) {
        this.size = size;
      }
      getContext(_kind: string, options?: unknown) {
        contexts.push(options);
        return {
          drawImage: (_image: unknown, ...args: number[]) => drawn.push(args),
        };
      }
      async convertToBlob(options: {type: string; quality: number}) {
        encoded.push(options);
        const bytes = Math.ceil((this.size[0] * this.size[1]) / pixelsPerByte);
        return new Blob([new Uint8Array(bytes)], {
          type: encodable(options.type) ? options.type : 'image/png',
        });
      }
    },
  );
  return {close, contexts, drawn, encoded};
}

// Over the 20,000-byte limit
const photo = new Blob([new Uint8Array(50_000)], {type: 'image/jpeg'});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createImageResizer', () => {
  it('uploads an image that fits byte for byte, whatever its size', async () => {
    const {drawn} = stubCanvas(8064, 6048);
    const small = new Blob([new Uint8Array(10_000)], {type: 'image/jpeg'});
    const resizer = createImageResizer({maxHeight: 1600, maxWidth: 1600});
    expect(await resizer(small, limit)).toBe(small);
    expect(drawn).toEqual([]);
  });

  it("uses the extension's maxFileSize unless maxBytes is set", async () => {
    stubCanvas(4000, 3000);
    expect(
      await createImageResizer()(photo, {...limit, maxFileSize: 60_000}),
    ).toBe(photo);
    const resized = await createImageResizer({maxBytes: 40_000})(photo, {
      ...limit,
      maxFileSize: 60_000,
    });
    expect(resized).not.toBe(photo);
  });

  it('re-encodes a larger image at full size first', async () => {
    // 4000 × 3000 encodes to 12,000 bytes
    const {close, contexts, drawn, encoded} = stubCanvas(4000, 3000);
    const result = await createImageResizer()(photo, limit);
    expect(drawn).toEqual([[0, 0, 4000, 3000]]);
    expect(encoded).toEqual([{quality: 0.92, type: 'image/jpeg'}]);
    expect(contexts).toEqual([{colorSpace: 'display-p3'}]);
    expect(result.size).toBe(12_000);
    expect(close).toHaveBeenCalled();
  });

  it('then shrinks it step by step until it fits', async () => {
    const {drawn} = stubCanvas(4000, 3000, 100);
    const result = await createImageResizer()(photo, limit);
    expect(result.size).toBeLessThanOrEqual(20_000);
    expect(drawn.length).toBeGreaterThan(1);
    expect(drawn[0]).toEqual([0, 0, 4000, 3000]);
    // Each step keeps the aspect ratio
    for (const [, , width, height] of drawn) {
      expect(width / height).toBeCloseTo(4 / 3, 2);
    }
  });

  it('caps the dimensions of a re-encoded image', async () => {
    const {drawn} = stubCanvas(8064, 6048);
    await createImageResizer({maxHeight: 2048, maxWidth: 2048})(photo, limit);
    expect(drawn).toEqual([[0, 0, 2048, 1536]]);
  });

  it('encodes images other than JPEG as WebP', async () => {
    const {encoded} = stubCanvas(4000, 1000);
    const png = new Blob([new Uint8Array(50_000)], {type: 'image/png'});
    await createImageResizer({quality: 0.5})(png, limit);
    expect(encoded).toEqual([{quality: 0.5, type: 'image/webp'}]);
  });

  it('encodes to the requested type when the browser can', async () => {
    const {encoded} = stubCanvas(4000, 3000);
    const resized = await createImageResizer({type: 'image/webp'})(
      photo,
      limit,
    );
    expect(resized.type).toBe('image/webp');
    expect(encoded).toEqual([{quality: 0.92, type: 'image/webp'}]);
  });

  it('falls back to the default type when the browser cannot', async () => {
    const {encoded} = stubCanvas(
      4000,
      3000,
      1000,
      type => type !== 'image/webp',
    );
    const resized = await createImageResizer({type: 'image/webp'})(
      photo,
      limit,
    );
    expect(resized.type).toBe('image/jpeg');
    expect(encoded).toEqual([
      {quality: 0.92, type: 'image/webp'},
      {quality: 0.92, type: 'image/jpeg'},
    ]);
  });

  it('returns GIFs unchanged, since they may be animated', async () => {
    const {drawn} = stubCanvas(4000, 4000);
    const gif = new Blob([new Uint8Array(50_000)], {type: 'image/gif'});
    expect(await createImageResizer()(gif, limit)).toBe(gif);
    expect(drawn).toEqual([]);
  });

  it('returns images the browser cannot decode unchanged', async () => {
    stubCanvas(4000, 4000);
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        throw new Error('decode');
      }),
    );
    expect(await createImageResizer()(photo, limit)).toBe(photo);
  });
});
