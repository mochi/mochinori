// @vitest-environment node

import {describe, expect, it} from 'vitest';

import {type ApiEnv, handleApiRequest} from '../../website/api.ts';

function createEnv(): ApiEnv {
  const counts = new Map<string, number>();
  return {
    COUNTER: {
      get: id => {
        const name = String(id);
        return {
          get: async () => counts.get(name) ?? 0,
          increment: async (by = 1) => {
            const count = (counts.get(name) ?? 0) + by;
            counts.set(name, count);
            return count;
          },
        };
      },
      idFromName: name => name as unknown as DurableObjectId,
    },
  };
}

function request(path: string, method = 'GET') {
  return new Request(`https://mochinori.dev${path}`, {method});
}

describe('handleApiRequest', () => {
  it('reports health', async () => {
    const response = await handleApiRequest(
      request('/api/health'),
      createEnv(),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ok: true});
  });

  it('counts per name', async () => {
    const env = createEnv();
    const post = (path: string) =>
      handleApiRequest(request(path, 'POST'), env).then(r => r.json());
    expect(await post('/api/counter/a')).toEqual({count: 1});
    expect(await post('/api/counter/a')).toEqual({count: 2});
    expect(await post('/api/counter/b')).toEqual({count: 1});
    const response = await handleApiRequest(request('/api/counter/a'), env);
    expect(await response.json()).toEqual({count: 2});
  });

  it('rejects other methods on counters', async () => {
    const response = await handleApiRequest(
      request('/api/counter/a', 'DELETE'),
      createEnv(),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('GET, POST');
  });

  it('404s unknown routes', async () => {
    const response = await handleApiRequest(request('/api/nope'), createEnv());
    expect(response.status).toBe(404);
  });
});
