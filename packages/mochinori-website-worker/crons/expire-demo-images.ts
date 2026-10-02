import {defineScheduled} from 'void';
import {storage} from 'void/storage';

import {IMAGE_KEY_PREFIX, secondsUntilExpiry} from '../server/imageUploads.ts';

export const cron = '*/15 * * * *';

/** Deletes demo image uploads older than IMAGE_TTL_MS */
export default defineScheduled(async controller => {
  const now = controller.scheduledTime;
  let cursor: string | undefined;
  do {
    const listed = await storage.list({cursor, prefix: IMAGE_KEY_PREFIX});
    const expired = listed.objects
      .filter(object => secondsUntilExpiry(object.uploaded, now) === 0)
      .map(object => object.key);
    if (expired.length > 0) {
      await storage.delete(expired);
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor !== undefined);
});
