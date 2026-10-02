# `@mochinori/cloudflare`

Everything mochinori runs on Cloudflare, managed with
[alchemy](https://alchemy.run) (infrastructure as TypeScript).

```text
alchemy.run.ts          every resource, in one place
src/website/            the Worker that serves mochinori.dev
src/durable-objects/    Durable Object classes
src/__tests__/unit/     unit tests (run by `pnpm run test-unit` at the root)
```

- **Website.** `packages/mochinori-website/build` is uploaded as Workers
  static assets. Requests for `/api/*` run the Worker in `src/website/`;
  everything else is served straight from the assets, with Docusaurus's
  `404.html` for missing pages.
- **Durable Objects.** Declare a namespace in `alchemy.run.ts`, write the class
  in `src/durable-objects/`, and export it from the entrypoint of the Worker
  that hosts it. `Counter` is an example, reachable at `/api/counter/<name>`
  (`GET` reads, `POST` increments).
- **Anything else** (R2 buckets, D1, KV, queues) is another resource in
  `alchemy.run.ts`, bound to the Worker that uses it.

## Commands

Run from the repository root:

| Command | What it does |
| --- | --- |
| `pnpm run cf:dev` | Build the site, then run the Worker and Durable Objects locally (Miniflare) on http://localhost:1337 |
| `pnpm run cf:deploy` | Build the site and deploy your personal stage (named after `$USER`) |
| `pnpm run cf:deploy --stage prod` | Deploy the `prod` stage |
| `pnpm run cf:destroy --stage <name>` | Delete every resource in a stage |

## Credentials

alchemy reads Cloudflare credentials from `pnpm exec alchemy login` (run in
this directory) or from `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
`cf:dev` asks for them too, although it runs everything locally.

State is kept in `cloudflare/.alchemy/` (git-ignored) by default. To share
state between machines and CI, set `ALCHEMY_STATE_TOKEN` to the same long
random secret everywhere; alchemy then keeps state in a Worker on the
Cloudflare account.

The `Deploy` GitHub workflow (`.github/workflows/deploy.yml`) only runs when
started by hand, and needs the `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
and `ALCHEMY_STATE_TOKEN` repository secrets.

## Compatibility date

`compatibilityDate` in `alchemy.run.ts` must not be newer than the `workerd`
bundled with alchemy supports, or `cf:dev` fails to start. Bump it when
upgrading alchemy.
