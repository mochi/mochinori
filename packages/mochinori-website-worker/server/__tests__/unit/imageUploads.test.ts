// @vitest-environment node
import {describe, expect, it} from 'vitest';

import {
  IMAGE_TTL_MS,
  imageResponseHeaders,
  isImageName,
  newImageName,
  secondsUntilExpiry,
  sniffImage,
} from '../../imageUploads.ts';

const bytes = (...parts: (string | number[])[]) =>
  new Uint8Array(
    parts.flatMap(part =>
      typeof part === 'string'
        ? Array.from(part, char => char.charCodeAt(0))
        : part,
    ),
  );

describe('sniffImage', () => {
  it.each([
    ['png', bytes([0x89], 'PNG\r\n', [0x1a, 0x0a, 0, 0]), 'image/png'],
    ['jpg', bytes([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg'],
    ['gif', bytes('GIF89a', [1, 0]), 'image/gif'],
    ['webp', bytes('RIFF', [0, 0, 0, 0], 'WEBPVP8 '), 'image/webp'],
    ['avif', bytes([0, 0, 0, 0x20], 'ftypavif'), 'image/avif'],
  ])('recognizes %s', (extension, data, contentType) => {
    expect(sniffImage(data)).toEqual({contentType, extension});
  });

  it.each([
    ['SVG', bytes('<svg xmlns="http://www.w3.org/2000/svg"/>')],
    ['HTML', bytes('<!doctype html><script>alert(1)</script>')],
    ['an empty body', bytes()],
    ['a truncated PNG header', bytes([0x89], 'PNG')],
  ])('refuses %s', (_name, data) => {
    expect(sniffImage(data)).toBe(null);
  });
});

describe('image names', () => {
  it('are random UUIDs with the sniffed extension', () => {
    const name = newImageName({contentType: 'image/png', extension: 'png'});
    expect(name).toMatch(/^[0-9a-f-]{36}\.png$/);
    expect(isImageName(name)).toBe(true);
  });

  it.each(['../secret.png', 'x.png', `${'a'.repeat(36)}.svg`, ''])(
    'reject %j',
    name => {
      expect(isImageName(name)).toBe(false);
    },
  );
});

describe('secondsUntilExpiry', () => {
  it('counts down to IMAGE_TTL_MS after upload, then stays at 0', () => {
    const uploaded = new Date(0);
    expect(secondsUntilExpiry(uploaded, 0)).toBe(IMAGE_TTL_MS / 1000);
    expect(secondsUntilExpiry(uploaded, IMAGE_TTL_MS - 1500)).toBe(1);
    expect(secondsUntilExpiry(uploaded, IMAGE_TTL_MS)).toBe(0);
    expect(secondsUntilExpiry(uploaded, IMAGE_TTL_MS * 2)).toBe(0);
  });
});

describe('imageResponseHeaders', () => {
  it('serves the bytes only as an inert image', () => {
    const headers = imageResponseHeaders('image/png', 60);
    expect(Object.fromEntries(headers)).toEqual({
      'cache-control': 'public, max-age=60',
      'content-disposition': 'inline',
      'content-security-policy': "default-src 'none'; sandbox",
      'content-type': 'image/png',
      'cross-origin-resource-policy': 'same-origin',
      'x-content-type-options': 'nosniff',
    });
  });
});
