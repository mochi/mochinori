// @vitest-environment node
import {afterEach, describe, expect, it, vi} from 'vitest';

import {createImageResizer} from '../../index.ts';

const signal = new AbortController().signal;

/** Stubs createImageBitmap and OffscreenCanvas for a bitmap of this size */
function stubCanvas(width: number, height: number) {
  const drawn: number[][] = [];
  const encoded: unknown[] = [];
  const close = vi.fn();
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({close, height, width})),
  );
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      getContext() {
        return {
          drawImage: (_image: unknown, ...args: number[]) => drawn.push(args),
        };
      }
      async convertToBlob(options: {type: string; quality: number}) {
        encoded.push(options);
        return new Blob(['resized'], {type: options.type});
      }
    },
  );
  return {close, drawn, encoded};
}

const photo = new Blob(['x'.repeat(100)], {type: 'image/jpeg'});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createImageResizer', () => {
  it('downscales large images to fit, keeping the aspect ratio', async () => {
    const {close, drawn, encoded} = stubCanvas(8064, 6048);
    const resized = await createImageResizer()(photo, {signal});
    expect(drawn).toEqual([[0, 0, 2048, 1536]]);
    expect(encoded).toEqual([{quality: 0.85, type: 'image/jpeg'}]);
    expect(resized.type).toBe('image/jpeg');
    expect(close).toHaveBeenCalled();
  });

  it('encodes images other than JPEG as WebP', async () => {
    const {encoded} = stubCanvas(4000, 1000);
    const png = new Blob(['png'], {type: 'image/png'});
    await createImageResizer({maxWidth: 1000, quality: 0.5})(png, {signal});
    expect(encoded).toEqual([{quality: 0.5, type: 'image/webp'}]);
  });

  it('returns images that already fit unchanged', async () => {
    const {drawn} = stubCanvas(1024, 768);
    expect(await createImageResizer()(photo, {signal})).toBe(photo);
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
