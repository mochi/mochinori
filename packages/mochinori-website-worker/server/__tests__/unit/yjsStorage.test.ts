// @vitest-environment node
import {DatabaseSync} from 'node:sqlite';
import {describe, expect, it} from 'vitest';
import {Doc} from 'yjs';

import {
  SNAPSHOT_PART_BYTES,
  type YjsSqlStorage,
  YjsStore,
} from '../../yjsStorage.ts';

/** A Durable Object's SQL storage, backed by an in-memory SQLite database */
function createStorage(): YjsSqlStorage & {db: DatabaseSync} {
  const db = new DatabaseSync(':memory:');
  return {
    db,
    sql: {
      exec(query, ...bindings) {
        const statement = db.prepare(query);
        const params = bindings as (string | number | Uint8Array)[];
        if (statement.columns().length === 0) {
          statement.run(...params);
          return {toArray: () => []};
        }
        const rows = statement.all(...params);
        return {toArray: () => rows};
      },
    },
    transactionSync(closure) {
      db.exec('BEGIN');
      try {
        const result = closure();
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

const count = (storage: {db: DatabaseSync}, table: string) =>
  (
    storage.db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as {
      n: number;
    }
  ).n;

/** A document whose every update is appended to `store`, like CollabDocument */
function loggedDoc(store: YjsStore): Doc {
  const doc = new Doc();
  store.load(doc);
  doc.on('update', (update: Uint8Array) => store.append(update));
  return doc;
}

describe('YjsStore', () => {
  it('starts an empty document from empty storage', () => {
    const doc = new Doc();
    new YjsStore(createStorage()).load(doc);
    expect(doc.getText('t').toString()).toBe('');
  });

  it('restores every logged update', () => {
    const storage = createStorage();
    const doc = loggedDoc(new YjsStore(storage));
    doc.getText('t').insert(0, 'hello');
    doc.getText('t').insert(5, ' world');
    expect(count(storage, 'yjs_updates')).toBe(2);

    const restored = new Doc();
    const store = new YjsStore(storage);
    store.load(restored);
    expect(restored.getText('t').toString()).toBe('hello world');
    expect(store.loggedUpdates).toBe(2);
  });

  it('folds the log into a snapshot and keeps logging after it', () => {
    const storage = createStorage();
    const store = new YjsStore(storage);
    const doc = loggedDoc(store);
    for (const char of 'abcdef') {
      doc.getText('t').insert(doc.getText('t').length, char);
    }
    store.compact(doc);
    expect(store.loggedUpdates).toBe(0);
    expect(count(storage, 'yjs_updates')).toBe(0);
    expect(count(storage, 'yjs_snapshot')).toBe(1);

    doc.getText('t').insert(6, 'g');
    const restored = new Doc();
    new YjsStore(storage).load(restored);
    expect(restored.getText('t').toString()).toBe('abcdefg');
  });

  it('splits a snapshot larger than a SQLite row into parts', () => {
    const storage = createStorage();
    const store = new YjsStore(storage);
    const doc = loggedDoc(store);
    // Random text compresses poorly in Yjs's encoding
    const text = Array.from({length: SNAPSHOT_PART_BYTES * 2.5}, () =>
      String.fromCharCode(33 + Math.floor(Math.random() * 90)),
    ).join('');
    doc.getText('t').insert(0, text);
    store.compact(doc);
    expect(count(storage, 'yjs_snapshot')).toBe(3);

    const restored = new Doc();
    new YjsStore(storage).load(restored);
    expect(restored.getText('t').toString()).toBe(text);
  });
});
