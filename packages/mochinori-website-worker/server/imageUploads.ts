/**
 * Rules for the demo image uploads stored in R2. Kept free of Void and
 * Cloudflare imports so they can be unit tested in Node.
 */

/** Uploaded demo images are deleted this long after upload */
export const IMAGE_TTL_MS = 60 * 60 * 1000;

/** The largest accepted upload, in bytes */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** R2 key prefix for uploaded images */
export const IMAGE_KEY_PREFIX = 'demo-images/';

export interface SniffedImage {
  contentType: string;
  extension: string;
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0) {
  return signature.every((byte, i) => bytes[offset + i] === byte);
}

function ascii(text: string): number[] {
  return Array.from(text, char => char.charCodeAt(0));
}

/**
 * Identifies an image from its leading bytes, ignoring whatever type the
 * client claimed. Only raster formats a browser renders inertly are
 * accepted: SVG can carry script, so it is refused.
 */
export function sniffImage(bytes: Uint8Array): SniffedImage | null {
  if (startsWith(bytes, [0x89, ...ascii('PNG\r\n'), 0x1a, 0x0a])) {
    return {contentType: 'image/png', extension: 'png'};
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return {contentType: 'image/jpeg', extension: 'jpg'};
  }
  if (
    startsWith(bytes, ascii('GIF87a')) ||
    startsWith(bytes, ascii('GIF89a'))
  ) {
    return {contentType: 'image/gif', extension: 'gif'};
  }
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) {
    return {contentType: 'image/webp', extension: 'webp'};
  }
  if (
    startsWith(bytes, ascii('ftyp'), 4) &&
    (startsWith(bytes, ascii('avif'), 8) || startsWith(bytes, ascii('avis'), 8))
  ) {
    return {contentType: 'image/avif', extension: 'avif'};
  }
  return null;
}

const IMAGE_NAME = /^[0-9a-f-]{36}\.(?:avif|gif|jpg|png|webp)$/;

/** Whether `name` could be a stored image (a random UUID plus extension) */
export function isImageName(name: string): boolean {
  return IMAGE_NAME.test(name);
}

/** A new unguessable name for an upload */
export function newImageName(image: SniffedImage): string {
  return `${crypto.randomUUID()}.${image.extension}`;
}

/** Seconds until an image uploaded at `uploaded` expires, or 0 if it has */
export function secondsUntilExpiry(uploaded: Date, now: number): number {
  return Math.max(
    0,
    Math.floor((uploaded.getTime() + IMAGE_TTL_MS - now) / 1000),
  );
}

/**
 * Headers for serving an uploaded image. `nosniff` and the sandboxing CSP
 * stop a browser from treating the bytes as anything but an image, even if
 * opened directly.
 */
export function imageResponseHeaders(
  contentType: string,
  maxAgeSeconds: number,
): Headers {
  return new Headers({
    'Cache-Control': `public, max-age=${maxAgeSeconds}`,
    'Content-Disposition': 'inline',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Content-Type': contentType,
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-Content-Type-Options': 'nosniff',
  });
}

/** How long a mirror may spend fetching the remote image */
export const MIRROR_TIMEOUT_MS = 10_000;

/** Redirects a mirror follows before giving up */
export const MIRROR_MAX_REDIRECTS = 3;

/**
 * Validates a URL the client asked to mirror: absolute `http:` or `https:`,
 * on the default port, with no credentials, and naming a host rather than
 * `localhost` or an IP address.
 */
export function parseMirrorUrl(input: unknown): URL | null {
  if (typeof input !== 'string' || input.length > 2048) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (
    (url.protocol !== 'https:' && url.protocol !== 'http:') ||
    url.port !== '' ||
    url.username !== '' ||
    url.password !== '' ||
    !host.includes('.') ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.startsWith('[') ||
    /^[\d.]+$/.test(host)
  ) {
    return null;
  }
  return url;
}

/** Why a mirror failed, with the status to answer the client with */
export class MirrorError extends Error {
  readonly status: 400 | 413 | 415 | 502;
  constructor(message: string, status: MirrorError['status']) {
    super(message);
    this.status = status;
  }
}

/** Reads a body, giving up once it is longer than `maxBytes` */
export async function readAtMost(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<Uint8Array | null> {
  const result = new Uint8Array(maxBytes);
  let length = 0;
  if (body) {
    const reader = body.getReader();
    for (;;) {
      const {done, value} = await reader.read();
      if (done) {
        break;
      }
      if (length + value.byteLength > maxBytes) {
        await reader.cancel();
        return null;
      }
      result.set(value, length);
      length += value.byteLength;
    }
  }
  return result.slice(0, length);
}

/**
 * Fetches a remote image to mirror. Each redirect is validated like the
 * original URL, and the body is capped at MAX_IMAGE_BYTES and must sniff
 * as an accepted image.
 */
export async function fetchRemoteImage(
  input: unknown,
  fetchFn: typeof fetch,
  signal: AbortSignal,
): Promise<{bytes: Uint8Array; image: SniffedImage; url: URL}> {
  let url = parseMirrorUrl(input);
  for (let redirects = 0; ; redirects++) {
    if (!url) {
      throw new MirrorError('Only public http and https URLs', 400);
    }
    const response = await fetchFn(url, {
      headers: {
        Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif',
        'User-Agent':
          'mochinori-demo-image-mirror (+https://github.com/mochi/mochinori)',
      },
      redirect: 'manual',
      signal,
    });
    const location = response.headers.get('Location');
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel();
      if (redirects >= MIRROR_MAX_REDIRECTS) {
        throw new MirrorError('Too many redirects', 502);
      }
      url = parseMirrorUrl(new URL(location, url).href);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new MirrorError(
        `The image server answered ${response.status}`,
        502,
      );
    }
    if (Number(response.headers.get('Content-Length')) > MAX_IMAGE_BYTES) {
      await response.body?.cancel();
      throw new MirrorError('Image is too large', 413);
    }
    const bytes = await readAtMost(response.body, MAX_IMAGE_BYTES);
    if (!bytes) {
      throw new MirrorError('Image is too large', 413);
    }
    const image = sniffImage(bytes);
    if (!image) {
      throw new MirrorError('Only PNG, JPEG, GIF, WebP and AVIF images', 415);
    }
    return {bytes, image, url};
  }
}
