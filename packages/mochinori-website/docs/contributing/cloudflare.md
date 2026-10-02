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
- `routes/api/images/` stores demo image uploads in R2 (the `STORAGE`
  binding, bucket `mochinori-demo-uploads`). `POST /api/images` checks the
  file's magic bytes (PNG, JPEG, GIF, WebP or AVIF; never SVG), caps it at
  5 MB and stores it under a random name. Posting JSON `{"url": ...}`
  instead mirrors a remote image: the Worker fetches it (public `http(s)`
  hosts only, each redirect checked the same way, 10 second timeout) and
  applies the same checks. `GET /api/images/<name>` serves it
  with `nosniff`, a sandboxing CSP and same-origin CORP. Uploads expire after
  an hour: reads of an expired object delete it, and
  `crons/expire-demo-images.ts` sweeps the bucket every 15 minutes. The
  rules live in `server/imageUploads.ts`, which has unit tests.
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

Every push to `main` deploys the site through the **Deploy** workflow. You
can also run that workflow from the Actions tab, or deploy from your
machine:

```sh
pnpm run deploy:website
```

The script runs `void deploy --platform cloudflare`, which creates the
`mochinori-website` Worker on the first deploy and updates it afterwards.
Without `--platform`, Void offers to link an existing Worker, and that fails
when the Worker doesn't exist yet. If an earlier run saved such a link,
delete `packages/mochinori-website-worker/.void/cloudflare-link.json` and
deploy again.

The first local deploy signs you in to Cloudflare and saves the account in
`packages/mochinori-website-worker/.void/project.json`. The workflow needs
the `CLOUDFLARE_API_TOKEN` secret, from a token that can edit Workers
Scripts and Workers R2 Storage. Set `CLOUDFLARE_ACCOUNT_ID` too when the
token can reach more than one account, and the `CLOUDFLARE_WORKERS_SUBDOMAIN`
variable to the account's workers.dev subdomain (the part before
`.workers.dev`).

## Pull request previews

The **Preview** workflow builds each pull request and uploads it as a new
version of the `mochinori-website` Worker without deploying it, then
comments its URL on the pull request:
`https://pr-<number>-mochinori-website.<subdomain>.workers.dev`. Each push
updates the same URL. It uses the same secrets as the Deploy workflow, and
skips pull requests from forks, which get no secrets.

A preview is a version of the production Worker, so it shares production's
R2 bucket and Durable Objects. The workflow creates any R2 bucket the pull
request adds. A pull request that adds a Durable Object migration gets no
preview, because only a deploy can apply migrations.

## Add a Cloudflare feature

- **API route:** add a file under `routes/`. Routes under `/api` reach the
  Worker before static assets.
- **Durable Object:** add a module under `durable-objects/`, run
  `pnpm --filter @mochinori/website-worker run prepare` to regenerate types,
  and
  commit the updated `void.lock.json`.
- **KV, R2, D1, queues and crons** are inferred from how the code uses them.
  See the [Void docs](https://void.cloud/guide) for each one.
