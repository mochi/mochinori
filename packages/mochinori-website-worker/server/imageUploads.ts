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
