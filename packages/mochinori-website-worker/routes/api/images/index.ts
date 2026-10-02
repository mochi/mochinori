import {defineHandler} from 'void';
import {storage} from 'void/storage';

import {
  IMAGE_KEY_PREFIX,
  IMAGE_TTL_MS,
  MAX_IMAGE_BYTES,
  newImageName,
  sniffImage,
} from '../../../server/imageUploads.ts';

/**
 * Stores a demo image upload. The body is the raw image; its type is
 * determined from its bytes. Images expire after IMAGE_TTL_MS.
 */
export const POST = defineHandler(async c => {
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
  const name = newImageName(image);
  await storage.put(IMAGE_KEY_PREFIX + name, bytes, {
    httpMetadata: {contentType: image.contentType},
  });
  return c.json(
    {
      expiresAt: new Date(Date.now() + IMAGE_TTL_MS).toISOString(),
      src: `/api/images/${name}`,
    },
    201,
  );
});
