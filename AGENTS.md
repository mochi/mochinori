# mochinori Agent Guide

Guidance for AI agents and automated tools working in this repository. The
tooling is modeled on the [Lexical](https://github.com/facebook/lexical)
monorepo, so Lexical's conventions apply unless this file says otherwise.

mochinori is a separate project from Lexical: it is not part of Meta's
open source program and has no CLA. Do not add Meta copyright headers to
mochinori code. Code copied or adapted from Lexical keeps its original MIT
notice.

## Commands

- `pnpm install` - Install dependencies (pnpm 11, Node 24; see `.nvmrc`)
- `pnpm run build` - Build the published packages into `dist/`
- `pnpm run build-website` - Build the Docusaurus site into
  `packages/mochinori-website/build`
- `pnpm run start:website` - Run the site with live reload
- `pnpm run test-unit` - Run unit tests (Vitest, jsdom by default)
- `pnpm run lint` / `lint:fix` - ESLint
- `pnpm run prettier` / `prettier:fix` - Prettier
- `pnpm run tsc`, `tsc-website`, `tsc-cloudflare` - TypeScript, per tsconfig
- `pnpm run ci-check` - Everything CI checks except tests and builds
- `pnpm run cf:dev` / `cf:deploy` / `cf:destroy` - The Cloudflare app (see
  `cloudflare/README.md`). Never deploy or destroy unless a person asked.

## Layout

- `packages/mochinori-<name>/` is the package `@mochinori/<name>`.
  - Published libraries (like `@mochinori/images`) build with plain `tsc`
    (`tsconfig.build.json`) into `dist/`.
  - `mochinori-website` is the Docusaurus docs and demos site.
  - `mochinori-eslint-plugin-internal` holds lint rules for this repo.
- `cloudflare/` is the alchemy app: `alchemy.run.ts` declares every Cloudflare
  resource; Worker code is in `cloudflare/src/`.
- `scripts/` holds repo scripts; `scripts/__tests__/unit/packages.test.ts`
  enforces the package conventions below.

## Package conventions

- Each published package exports its TypeScript entry under the
  `mochinori-source` condition first, then `types` and `default` for `dist/`.
  The root tsconfig, Vitest and the website resolve `mochinori-source`, so
  development never needs a build. The condition is namespaced because
  Lexical's own packages export a `source` condition, and Lexical must always
  resolve to its published build.
- Relative imports name the real file, extension included
  (`./ImageNode.tsx`). `tsc` rewrites them to `.js`
  (`rewriteRelativeImportExtensions`), so `dist/` is valid ESM for Node.
- Use `import type` for type-only imports (`verbatimModuleSyntax`).
- Public entry points (`src/index.ts`) use named exports only.

## Lexical is a singleton within one app

An app must resolve exactly one copy of `lexical` and of each `@lexical/*`
package. So:

- Published packages list `lexical`, `@lexical/*`, `react` and `react-dom` in
  `peerDependencies`, never `dependencies`.
- Inside the workspace every package uses `catalog:` for Lexical, so the
  whole repo is on one version. Bump Lexical by editing the `catalog` in
  `pnpm-workspace.yaml`, and the peer ranges with it.

## Writing Lexical code

- `$`-prefixed functions only run inside `editor.update()`, `editor.read()`,
  transforms and command handlers. `@lexical/rules-of-lexical` checks this.
- Prefer extensions (`defineExtension`) over React plugins. Extensions whose
  behavior can be switched off take a `disabled` config and expose it as a
  signal with `namedSignals` (see `ImagesExtension`).
- Nodes use `$config()`. A node with its own `__fields` and no `clone` must
  copy them in `afterCloneFrom`, or they are lost the first time a later
  update clones the node.
- Library code must not touch the global `document` or `window` (ESLint
  enforces this): use `$getDocument()` in `createDOM`/`exportDOM` and the
  editor's own window elsewhere, so editors in Shadow DOM and iframes work.
  See Lexical's AGENTS.md for the full table of replacements.

## Backwards compatibility

Once a package is published, changes must be backwards compatible: keep
exported APIs and the serialized JSON of nodes working, add rather than
rename, and deprecate before removing.

## Testing

- Unit tests live in `**/__tests__/unit/**/*.test.{ts,tsx}`. Add
  `// @vitest-environment node` as the first line of tests that need no DOM.
- Build editors in tests with `buildEditorFromExtensions` and dispose them
  (`using editor = ...`).
- Cloudflare Worker logic is tested in Node by keeping it free of
  `cloudflare:*` imports (see `cloudflare/src/website/api.ts`).

## Commits and pull requests

Write commit messages and PR descriptions to the shape of
`.github/pull_request_template.md`: a `[packages] Type: title` subject, a
`## Description`, and a `## Test plan` with real `### Before` and
`### After` output. Never include agent session URLs or other private links.
