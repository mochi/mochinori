import {defineHandler} from 'void';
import {storage} from 'void/storage';

import {
  IMAGE_KEY_PREFIX,
  imageResponseHeaders,
  isImageName,
  secondsUntilExpiry,
} from '../../../server/imageUploads.ts';

/** Serves an uploaded demo image until it expires */
export const GET = defineHandler(async c => {
  const name = c.req.param('name');
  if (name === undefined || !isImageName(name)) {
    return c.json({error: 'Not Found'}, 404);
  }
  const key = IMAGE_KEY_PREFIX + name;
  const object = await storage.get(key);
  if (!object) {
    return c.json({error: 'Not Found'}, 404);
  }
  const maxAge = secondsUntilExpiry(object.uploaded, Date.now());
  if (maxAge === 0) {
    // The cleanup cron has not reached it yet
    c.executionCtx.waitUntil(storage.delete(key));
    return c.json({error: 'Not Found'}, 404);
  }
  return new Response(object.body, {
    headers: imageResponseHeaders(
      object.httpMetadata?.contentType ?? 'application/octet-stream',
      maxAge,
    ),
  });
});
