// @vitest-environment node
import {describe, expect, it} from 'vitest';

import {
  fetchRemoteImage,
  IMAGE_TTL_MS,
  imageResponseHeaders,
  isImageName,
  MAX_IMAGE_BYTES,
  MirrorError,
  newImageName,
  parseMirrorUrl,
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

describe('parseMirrorUrl', () => {
  it.each([
    'https://upload.wikimedia.org/wikipedia/commons/a/a9/Mochi.jpg',
    'http://example.com/a.png?x=1',
  ])('accepts %s', url => {
    expect(parseMirrorUrl(url)?.href).toBe(url);
  });

  it.each([
    [42],
    ['/relative.png'],
    ['ftp://example.com/a.png'],
    ['data:image/png;base64,AAAA'],
    ['https://example.com:8443/a.png'],
    ['https://user:pass@example.com/a.png'],
    ['http://localhost/a.png'],
    ['http://app.localhost/a.png'],
    ['http://intranet/a.png'],
    ['http://127.0.0.1/a.png'],
    ['http://[::1]/a.png'],
    ['https://example.com/' + 'a'.repeat(2048)],
  ])('rejects %s', url => {
    expect(parseMirrorUrl(url)).toBeNull();
  });
});

describe('fetchRemoteImage', () => {
  const gif = bytes('GIF89a', [1, 0, 1, 0]);
  const signal = new AbortController().signal;
  const respond =
    (...responses: Response[]): typeof fetch =>
    async () =>
      responses.shift()!;

  const failure = async (promise: Promise<unknown>) => {
    const error = await promise.then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(MirrorError);
    return error as MirrorError;
  };

  it('returns the sniffed image', async () => {
    const result = await fetchRemoteImage(
      'https://example.com/a',
      respond(new Response(gif)),
      signal,
    );
    expect(result.image.contentType).toBe('image/gif');
    expect(result.bytes).toEqual(gif);
  });

  it('follows redirects to public URLs', async () => {
    const result = await fetchRemoteImage(
      'https://example.com/a',
      respond(
        new Response(null, {headers: {Location: '/b.gif'}, status: 302}),
        new Response(gif),
      ),
      signal,
    );
    expect(result.url.href).toBe('https://example.com/b.gif');
  });

  it('refuses redirects to local hosts', async () => {
    const error = await failure(
      fetchRemoteImage(
        'https://example.com/a',
        respond(
          new Response(null, {
            headers: {Location: 'http://localhost/secret'},
            status: 302,
          }),
        ),
        signal,
      ),
    );
    expect(error.status).toBe(400);
  });

  it('gives up after too many redirects', async () => {
    const loop = () =>
      new Response(null, {headers: {Location: '/again'}, status: 301});
    const error = await failure(
      fetchRemoteImage(
        'https://example.com/a',
        respond(loop(), loop(), loop(), loop()),
        signal,
      ),
    );
    expect(error.status).toBe(502);
  });

  it('reports a failed fetch as a bad gateway', async () => {
    const error = await failure(
      fetchRemoteImage(
        'https://example.com/a',
        respond(new Response('nope', {status: 404})),
        signal,
      ),
    );
    expect(error.status).toBe(502);
  });

  it('refuses bodies that are not accepted images', async () => {
    const error = await failure(
      fetchRemoteImage(
        'https://example.com/a.svg',
        respond(new Response('<svg xmlns="http://www.w3.org/2000/svg"/>')),
        signal,
      ),
    );
    expect(error.status).toBe(415);
  });

  it('refuses images over the size limit, declared or not', async () => {
    const declared = await failure(
      fetchRemoteImage(
        'https://example.com/a',
        respond(
          new Response(gif, {
            headers: {'Content-Length': String(MAX_IMAGE_BYTES + 1)},
          }),
        ),
        signal,
      ),
    );
    expect(declared.status).toBe(413);
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    big.set(gif);
    const streamed = await failure(
      fetchRemoteImage(
        'https://example.com/a',
        respond(
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(big.subarray(0, MAX_IMAGE_BYTES));
                controller.enqueue(big.subarray(MAX_IMAGE_BYTES));
                controller.close();
              },
            }),
          ),
        ),
        signal,
      ),
    );
    expect(streamed.status).toBe(413);
  });
});
