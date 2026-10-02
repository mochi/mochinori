import type {WebsiteEnv} from '../../alchemy.run.ts';

import {handleApiRequest} from './api.ts';

// Durable Object classes hosted by this Worker must be exported from its
// entrypoint.
export {Counter} from '../durable-objects/Counter.ts';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return handleApiRequest(request, env);
    }
    // Only reached for asset paths in local dev; deployed, the assets are
    // served before the Worker runs.
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<WebsiteEnv>;
