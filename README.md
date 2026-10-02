<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="packages/mochinori-website/static/img/logo/mochinori-logo-dark.svg">
    <img alt="mochinori" src="packages/mochinori-website/static/img/logo/mochinori-logo.svg" width="320">
  </picture>
</p>

<p align="center">Batteries-included extensions for <a href="https://lexical.dev">Lexical</a> editors.</p>

---

mochinori turns the features Lexical leaves to you (images, uploads, embeds)
into packages you can install. It builds on the published `lexical` and
`@lexical/*` packages and never forks them.

## Packages

| Package | Status |
| --- | --- |
| [`@mochinori/images`](packages/mochinori-images) | In progress: an image node with upload, resizing and captions |

## Repository layout

```text
packages/
  mochinori-images/                 @mochinori/images (published)
  mochinori-website/                the docs and demos site (Docusaurus on Void)
  mochinori-eslint-plugin-internal/ lint rules for this repo
scripts/                            repo scripts and their tests
```

## Development

Requires Node 24.15 or later (see `.nvmrc`) and pnpm 11.

```sh
pnpm install
pnpm run start:website   # docs and demos at http://localhost:3000
pnpm run test-unit       # Vitest
pnpm run ci-check        # TypeScript, Prettier and ESLint
pnpm run build           # build the published packages
```

The website deploys to Cloudflare with [Void](https://void.cloud): the
Docusaurus build is served as static assets, alongside API routes and Durable
Objects. See the
[Cloudflare guide](packages/mochinori-website/docs/contributing/cloudflare.md)
for running it locally and deploying.

## License

MIT, see [LICENSE](LICENSE). Code adapted from
[Lexical](https://github.com/facebook/lexical) keeps its original MIT notice.
