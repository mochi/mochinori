import type {Connection, ConnectionContext} from 'partyserver';

import {YServer} from 'y-partyserver';

import {YjsStore} from '../server/yjsStorage.ts';

/**
 * How long a demo document is kept after its last edit or visit. The demo's
 * uploaded images expire after an hour too (server/imageUploads.ts).
 */
export const COLLAB_DOCUMENT_TTL_MS = 60 * 60 * 1000;

// Fold the update log into the snapshot once it grows past this
const MAX_LOGGED_UPDATES = 500;

/**
 * One collaborative Yjs document, served by y-partyserver over the standard
 * Yjs WebSocket protocol, so clients connect with `YProvider` (or any
 * y-websocket compatible provider) and `@lexical/yjs` works unchanged.
 *
 * Every update is appended to SQLite as it arrives; the debounced `onSave`
 * folds the log into a snapshot. Sockets hibernate, so an idle document
 * costs nothing until someone types.
 */
export class CollabDocument extends YServer {
  static options = {hibernate: true};

  #store: YjsStore | null = null;

  async onLoad(): Promise<void> {
    const store = new YjsStore(this.ctx.storage);
    store.load(this.document);
    this.#store = store;
    // Registered after loading, so replaying storage writes nothing
    this.document.on('update', (update: Uint8Array) => store.append(update));
  }

  async onSave(): Promise<void> {
    if (this.#store && this.#store.loggedUpdates > MAX_LOGGED_UPDATES) {
      this.#store.compact(this.document);
    }
    await this.#scheduleExpiry();
  }

  onConnect(connection: Connection, ctx: ConnectionContext): void {
    super.onConnect(connection, ctx);
    void this.#scheduleExpiry();
  }

  onClose(
    connection: Connection,
    code: number,
    reason: string,
    wasClean: boolean,
  ): void {
    super.onClose(connection, code, reason, wasClean);
    void this.#scheduleExpiry();
  }

  async onAlarm(): Promise<void> {
    if ([...this.getConnections()].length > 0) {
      await this.#scheduleExpiry();
      return;
    }
    await this.ctx.storage.deleteAll();
    // Drop the in-memory document too, so the next visitor starts empty
    this.ctx.abort('expired');
  }

  #scheduleExpiry(): Promise<void> {
    return this.ctx.storage.setAlarm(Date.now() + COLLAB_DOCUMENT_TTL_MS);
  }
}

/**
 * Void exports each module in durable-objects/ as a Durable Object class.
 * It expects a `defineDurableState()` result, but its generated Worker entry
 * only reads that object's `class` and calls its `__bind()`, so this hands
 * Void a class of our own (and gets a `COLLAB` binding to address it). This
 * relies on Void internals; see the collaboration docs page before
 * upgrading Void.
 */
export default {
  __bind(): void {},
  class: CollabDocument,
};
