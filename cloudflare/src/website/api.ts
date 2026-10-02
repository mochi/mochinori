/**
 * Routes for /api/*. Static assets never reach the Worker (see
 * `run_worker_first` in alchemy.run.ts), so this only sees API requests.
 */

/** The subset of the Worker's bindings the API uses */
export interface ApiEnv {
  COUNTER: {
    get(id: DurableObjectId): {
      get(): Promise<number>;
      increment(by?: number): Promise<number>;
    };
    idFromName(name: string): DurableObjectId;
  };
}

const COUNTER_ROUTE = /^\/api\/counter\/([\w-]{1,64})$/;

function json(body: unknown, init?: ResponseInit): Response {
  return Response.json(body, init);
}

export async function handleApiRequest(
  request: Request,
  env: ApiEnv,
): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === '/api/health') {
    return json({ok: true});
  }

  const counterMatch = COUNTER_ROUTE.exec(url.pathname);
  if (counterMatch) {
    const counter = env.COUNTER.get(env.COUNTER.idFromName(counterMatch[1]));
    switch (request.method) {
      case 'GET':
        return json({count: await counter.get()});
      case 'POST':
        return json({count: await counter.increment()});
      default:
        return json(
          {error: 'Method Not Allowed'},
          {headers: {Allow: 'GET, POST'}, status: 405},
        );
    }
  }

  return json({error: 'Not Found'}, {status: 404});
}
