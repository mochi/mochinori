# @mochinori/website-worker

The Cloudflare Worker for [mochinori.dev](https://mochinori.dev), built and
deployed with [Void](https://void.cloud). It serves the Docusaurus site from
[`@mochinori/website`](../mochinori-website) as static assets, plus the API
routes in `routes/` and the Durable Objects in `durable-objects/`.

The Docusaurus site is a separate package because Void treats a package that
depends on `@docusaurus/core` as a static site.

See the
[Cloudflare guide](../mochinori-website/docs/contributing/cloudflare.md)
for running it locally and deploying.
