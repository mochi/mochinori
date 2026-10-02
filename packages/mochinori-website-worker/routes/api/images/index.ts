import {defineHandler} from 'void';
import {storage} from 'void/storage';

import {
  fetchRemoteImage,
  IMAGE_KEY_PREFIX,
  IMAGE_TTL_MS,
  MAX_IMAGE_BYTES,
  MIRROR_TIMEOUT_MS,
  MirrorError,
  newImageName,
  type SniffedImage,
  sniffImage,
} from '../../../server/imageUploads.ts';

async function storeImage(
  bytes: Uint8Array,
  image: SniffedImage,
  sourceUrl?: URL,
) {
  const name = newImageName(image);
  await storage.put(IMAGE_KEY_PREFIX + name, bytes, {
    httpMetadata: {contentType: image.contentType},
    ...(sourceUrl ? {customMetadata: {sourceUrl: sourceUrl.href}} : {}),
  });
  return {
    expiresAt: new Date(Date.now() + IMAGE_TTL_MS).toISOString(),
    src: `/api/images/${name}`,
  };
}

/**
 * Stores a demo image. The body is either the raw image (an upload), or
 * JSON `{"url": "<remote url>"}` (a mirror), in which case the Worker
 * fetches the remote image itself. Either way the type is determined from
 * the image's bytes, and the image expires after IMAGE_TTL_MS.
 */
export const POST = defineHandler(async c => {
  if (c.req.header('Content-Type')?.startsWith('application/json')) {
    const body: unknown = await c.req.json().catch(() => null);
    const input =
      body !== null && typeof body === 'object' && 'url' in body
        ? body.url
        : undefined;
    try {
      const {bytes, image, url} = await fetchRemoteImage(
        input,
        fetch,
        AbortSignal.timeout(MIRROR_TIMEOUT_MS),
      );
      return c.json(await storeImage(bytes, image, url), 201);
    } catch (error) {
      if (error instanceof MirrorError) {
        return c.json({error: error.message}, error.status);
      }
      return c.json({error: 'The image could not be fetched'}, 502);
    }
  }
  const declaredLength = Number(c.req.header('Content-Length'));
  if (declaredLength > MAX_IMAGE_BYTES) {
    return c.json({error: 'Image is too large'}, 413);
  }
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    return c.json({error: 'Image is too large'}, 413);
  }
  const image = sniffImage(bytes);
  if (!image) {
    return c.json({error: 'Only PNG, JPEG, GIF, WebP and AVIF images'}, 415);
  }
  return c.json(await storeImage(bytes, image), 201);
});
