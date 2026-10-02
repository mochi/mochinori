---
title: The monorepo
---

# The monorepo

The [mochinori repository](https://github.com/mochi/mochinori) is a pnpm
workspace modeled on the Lexical monorepo's tooling.

```text
packages/
  mochinori-images/                 @mochinori/images, a published library
  mochinori-website/                this site (Docusaurus)
  mochinori-website-worker/         the Void app that serves this site
  mochinori-eslint-plugin-internal/ lint rules for the repo itself
scripts/                            repo scripts and their tests
```

## Commands

| Command | What it does |
| --- | --- |
| `pnpm install` | Install everything |
| `pnpm run build` | Build the published libraries into `dist/` |
| `pnpm run start:website` | Run this site locally with live reload |
| `pnpm run dev:website` | Build this site and run it with its API routes and Durable Objects |
| `pnpm run test-unit` | Run unit tests (Vitest) |
| `pnpm run lint` / `lint:fix` | ESLint |
| `pnpm run prettier` / `prettier:fix` | Prettier |
| `pnpm run ci-check` | TypeScript, Prettier and ESLint, as CI runs them |

## Adding a library

1. Create `packages/mochinori-<name>/` with a `package.json` named
   `@mochinori/<name>`. Copy `packages/mochinori-images` for the layout.
2. Export the TypeScript entry point under the `mochinori-source` condition
   and the built file under `default`. Tests, the typechecker and this site
   all resolve `mochinori-source`, so nothing needs building during
   development.
3. List `lexical` and `@lexical/*` in `peerDependencies`, and in
   `devDependencies` as `catalog:` so the whole repo shares one version.
   `scripts/__tests__/unit/packages.test.ts` enforces this.
4. Write relative imports with the file's real extension
   (`./ImageNode.tsx`); `tsc` rewrites them to `.js` when it builds.
