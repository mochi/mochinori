---
title: Cloudflare
---

# Cloudflare

Everything that runs on Cloudflare lives in `cloudflare/` and is managed by
[alchemy](https://alchemy.run), infrastructure as TypeScript.

- `cloudflare/alchemy.run.ts` declares every resource: the website Worker,
  Durable Object namespaces, and anything added later (R2 buckets, D1, queues).
- `cloudflare/src/website/` is the Worker that serves this site. The
  Docusaurus build is uploaded as static assets; the Worker itself only
  handles `/api/*`.
- `cloudflare/src/durable-objects/` holds Durable Object classes. `Counter`
  is an example, reachable at `/api/counter/<name>`.

## Running locally

```sh
pnpm run cf:dev
```

This builds the site, then runs the Worker and its Durable Objects locally
with Miniflare on http://localhost:1337. alchemy expects Cloudflare
credentials to be configured even for local runs (see below), but nothing is
deployed. For working on the site's content, `pnpm run start:website` is
faster: it reloads as you edit.

## Deploying

Deploying needs a Cloudflare account and API token:

```sh
# or run `pnpm exec alchemy login` in cloudflare/
export CLOUDFLARE_API_TOKEN=...
export CLOUDFLARE_ACCOUNT_ID=...
pnpm run cf:deploy --stage prod
```

Each stage (`--stage`, defaulting to your username) is an independent copy of
every resource, named `mochinori-website-<stage>`. `pnpm run cf:destroy`
removes a stage.

By default alchemy keeps state in `cloudflare/.alchemy/` on your machine.
To share state between machines or CI, set `ALCHEMY_STATE_TOKEN` (any long
random secret, the same everywhere) and alchemy stores state in a Worker on
your Cloudflare account instead.
