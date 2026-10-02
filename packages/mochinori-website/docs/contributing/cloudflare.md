---
title: Cloudflare
---

# Cloudflare

This site runs on Cloudflare as a [Void](https://void.cloud) app. Void
builds one Worker that serves the Docusaurus output as static assets, plus
the site's API routes and Durable Objects. The Worker is its own package,
`packages/mochinori-website-worker/` (`@mochinori/website-worker`), separate
from the Docusaurus site in `packages/mochinori-website/`. Void treats any
package that depends on `@docusaurus/core` as a static site and refuses to
deploy it with a backend, even with `inference.appType: 'void'` (true of
Void 0.22.0).

In `packages/mochinori-website-worker/`:

- `void.config.ts` sets the Worker name and compatibility date. It also tells
  Void to build the Docusaurus site first
  (`pnpm --filter @mochinori/website run build && vite build`) and to serve
  Docusaurus's own `404.html` for unknown URLs.
- `vite.config.ts` adds `voidPlugin()` and uses
  `../mochinori-website/build` (the Docusaurus output) as the static assets.
- `routes/` holds API routes. Each file exports Hono handlers per method,
  wrapped in `defineHandler`, and `[name]` is a path parameter.
  `routes/api/health.ts` serves `GET /api/health`, and
  `routes/api/counter/[name].ts` serves `GET` and `POST /api/counter/<name>`.
- `durable-objects/` holds Durable Objects. Each module default-exports a
  `defineDurableState` definition, and Void derives the binding and class
  from the filename. `counter.ts` becomes the `COUNTER` binding and the
  `CounterDurableObject` class. Routes call it with
  `Counter.get(name).increment(1)`.
- `void.lock.json` records the generated bindings and Durable Object
  migrations. Commit it whenever it changes: Cloudflare migrations are
  append-only, and the lock keeps their order.

## Run it locally

```sh
pnpm run dev:website
```

This builds the site, then serves it with the API routes and Durable Objects
in Miniflare at http://localhost:5173. Use `pnpm run start:website` instead
for live-reloading docs work; it runs Docusaurus alone, without the API.

To check a production build:

```sh
pnpm run build-website
pnpm --filter @mochinori/website-worker run preview
```

## Deploy

Deploys are manual. Run the **Deploy** workflow from the Actions tab, or
deploy from your machine:

```sh
pnpm run deploy:website
```

The first local deploy signs you in to Cloudflare and saves the account in
`packages/mochinori-website-worker/.void/project.json`. The workflow needs the `CLOUDFLARE_API_TOKEN` secret.
Set `CLOUDFLARE_ACCOUNT_ID` too when the token can reach more than one
account. Set the `CLOUDFLARE_WORKERS_SUBDOMAIN` variable if the Worker has no
preview URL.

## Add a Cloudflare feature

- **API route:** add a file under `routes/`. Routes under `/api` reach the
  Worker before static assets.
- **Durable Object:** add a module under `durable-objects/`, run
  `pnpm --filter @mochinori/website-worker run prepare` to regenerate types,
  and
  commit the updated `void.lock.json`.
- **KV, R2, D1, queues and crons** are inferred from how the code uses them.
  See the [Void docs](https://void.cloud/guide) for each one.
