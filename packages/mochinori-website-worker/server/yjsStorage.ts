import type {Doc} from 'yjs';

import {applyUpdate, encodeStateAsUpdate} from 'yjs';

/**
 * The parts of a Durable Object's `ctx.storage` that the Yjs store uses, so
 * tests can back it with plain SQLite.
 */
export interface YjsSqlStorage {
  sql: {
    exec(
      query: string,
      ...bindings: unknown[]
    ): {toArray(): Record<string, unknown>[]};
  };
  transactionSync<T>(closure: () => T): T;
}

// SQLite rows are limited to 2 MB, so a snapshot is stored in parts
export const SNAPSHOT_PART_BYTES = 1024 * 1024;

/**
 * Stores a Yjs document in SQLite as a snapshot (`yjs_snapshot`, in parts)
 * followed by a log of the updates since (`yjs_updates`).
 */
export class YjsStore {
  readonly storage: YjsSqlStorage;
  /** Updates in the log since the last snapshot */
  loggedUpdates = 0;

  constructor(storage: YjsSqlStorage) {
    this.storage = storage;
    storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS yjs_snapshot (part INTEGER PRIMARY KEY, data BLOB NOT NULL)',
    );
    storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS yjs_updates (seq INTEGER PRIMARY KEY AUTOINCREMENT, data BLOB NOT NULL)',
    );
  }

  /** Applies the snapshot, then every logged update, to `doc` */
  load(doc: Doc): void {
    const {sql} = this.storage;
    const parts = sql
      .exec('SELECT data FROM yjs_snapshot ORDER BY part')
      .toArray()
      .map(row => toBytes(row.data));
    if (parts.length > 0) {
      applyUpdate(doc, concat(parts));
    }
    const updates = sql
      .exec('SELECT data FROM yjs_updates ORDER BY seq')
      .toArray();
    for (const row of updates) {
      applyUpdate(doc, toBytes(row.data));
    }
    this.loggedUpdates = updates.length;
  }

  /** Appends one update to the log */
  append(update: Uint8Array): void {
    this.storage.sql.exec('INSERT INTO yjs_updates (data) VALUES (?)', update);
    this.loggedUpdates++;
  }

  /** Replaces the snapshot and the log with the whole of `doc` */
  compact(doc: Doc): void {
    const snapshot = encodeStateAsUpdate(doc);
    const {sql} = this.storage;
    this.storage.transactionSync(() => {
      sql.exec('DELETE FROM yjs_snapshot');
      sql.exec('DELETE FROM yjs_updates');
      for (let i = 0; i * SNAPSHOT_PART_BYTES < snapshot.length; i++) {
        sql.exec(
          'INSERT INTO yjs_snapshot (part, data) VALUES (?, ?)',
          i,
          snapshot.subarray(
            i * SNAPSHOT_PART_BYTES,
            (i + 1) * SNAPSHOT_PART_BYTES,
          ),
        );
      }
    });
    this.loggedUpdates = 0;
  }
}

function toBytes(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  throw new TypeError('Expected a BLOB column');
}

function concat(parts: Uint8Array[]): Uint8Array {
  if (parts.length === 1) {
    return parts[0];
  }
  const bytes = new Uint8Array(
    parts.reduce((length, part) => length + part.byteLength, 0),
  );
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return bytes;
}
