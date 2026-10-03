import {env} from 'cloudflare:workers';
import {defineHandler} from 'void';

const DOCUMENT_NAME = /^[\w-]{1,64}$/;

/**
 * Opens a Yjs WebSocket to the collaborative document named in the path.
 * Each name is its own Durable Object (durable-objects/collab.ts).
 */
export const GET = defineHandler(c => {
  const name = c.req.param('doc');
  if (name === undefined || !DOCUMENT_NAME.test(name)) {
    return c.json({error: 'Invalid document name'}, 400);
  }
  if (c.req.header('upgrade')?.toLowerCase() !== 'websocket') {
    return c.json({error: 'Expected a WebSocket upgrade'}, 426);
  }
  // Void binds durable-objects/collab.ts as COLLAB
  const namespace = (env as unknown as {COLLAB: DurableObjectNamespace}).COLLAB;
  return namespace.getByName(name).fetch(c.req.raw);
});
