import {DurableObject} from 'cloudflare:workers';

/**
 * An example Durable Object: a named counter persisted in the object's
 * SQLite-backed storage. Each name gets its own instance.
 */
export class Counter extends DurableObject {
  async get(): Promise<number> {
    return (await this.ctx.storage.get<number>('count')) ?? 0;
  }

  async increment(by: number = 1): Promise<number> {
    const count = (await this.get()) + by;
    await this.ctx.storage.put('count', count);
    return count;
  }
}
