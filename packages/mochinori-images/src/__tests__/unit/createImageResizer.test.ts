// @vitest-environment node
import {afterEach, describe, expect, it, vi} from 'vitest';

import {createImageResizer} from '../../index.ts';

const signal = new AbortController().signal;

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

const photo = new Blob(['x'.repeat(100)], {type: 'image/jpeg'});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createImageResizer', () => {
  it('downscales large images to fit, keeping the aspect ratio', async () => {
    const {close, contexts, drawn, encoded} = stubCanvas(8064, 6048);
    const resized = await createImageResizer()(photo, {signal});
    expect(drawn).toEqual([[0, 0, 2048, 1536]]);
    expect(encoded).toEqual([{quality: 0.92, type: 'image/jpeg'}]);
    expect(contexts).toEqual([{colorSpace: 'display-p3'}]);
    expect(resized.type).toBe('image/jpeg');
    expect(close).toHaveBeenCalled();
  });

  it('encodes images other than JPEG as WebP', async () => {
    const {encoded} = stubCanvas(4000, 1000);
    const png = new Blob(['png'], {type: 'image/png'});
    await createImageResizer({maxWidth: 1000, quality: 0.5})(png, {signal});
    expect(encoded).toEqual([{quality: 0.5, type: 'image/webp'}]);
  });

  it('encodes to the requested type when the browser can', async () => {
    const {encoded} = stubCanvas(4000, 3000);
    const resized = await createImageResizer({type: 'image/webp'})(photo, {
      signal,
    });
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
    const resized = await createImageResizer({type: 'image/webp'})(photo, {
      signal,
    });
    expect(resized.type).toBe('image/jpeg');
    expect(encoded).toEqual([
      {quality: 0.92, type: 'image/webp'},
      {quality: 0.92, type: 'image/jpeg'},
    ]);
  });

  it('returns images that already fit unchanged', async () => {
    const {drawn} = stubCanvas(1024, 768);
    expect(await createImageResizer()(photo, {signal})).toBe(photo);
    expect(drawn).toEqual([]);
  });

  it('re-encodes an image over maxBytes at full size first', async () => {
    // 4000 × 3000 encodes to 12,000 bytes
    const {drawn} = stubCanvas(4000, 3000);
    const big = new Blob([new Uint8Array(50_000)], {type: 'image/jpeg'});
    const resizer = createImageResizer({
      maxBytes: 20_000,
      maxHeight: Infinity,
      maxWidth: Infinity,
    });
    const result = await resizer(big, {signal});
    expect(drawn).toEqual([[0, 0, 4000, 3000]]);
    expect(result.size).toBe(12_000);
  });

  it('then shrinks it step by step until it fits maxBytes', async () => {
    const {drawn} = stubCanvas(4000, 3000, 100);
    const big = new Blob([new Uint8Array(500_000)], {type: 'image/jpeg'});
    const resizer = createImageResizer({
      maxBytes: 20_000,
      maxHeight: Infinity,
      maxWidth: Infinity,
    });
    const result = await resizer(big, {signal});
    expect(result.size).toBeLessThanOrEqual(20_000);
    expect(drawn.length).toBeGreaterThan(1);
    expect(drawn[0]).toEqual([0, 0, 4000, 3000]);
    // Each step keeps the aspect ratio
    for (const [, , width, height] of drawn) {
      expect(width / height).toBeCloseTo(4 / 3, 2);
    }
  });

  it('leaves images within maxBytes and the dimensions alone', async () => {
    const {drawn} = stubCanvas(4000, 3000);
    const resizer = createImageResizer({
      maxBytes: 1000,
      maxHeight: Infinity,
      maxWidth: Infinity,
    });
    expect(await resizer(photo, {signal})).toBe(photo);
    expect(drawn).toEqual([]);
  });

  it('returns GIFs unchanged, since they may be animated', async () => {
    const {drawn} = stubCanvas(4000, 4000);
    const gif = new Blob(['gif'], {type: 'image/gif'});
    expect(await createImageResizer()(gif, {signal})).toBe(gif);
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
    expect(await createImageResizer()(photo, {signal})).toBe(photo);
  });
});
