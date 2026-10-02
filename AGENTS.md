# mochinori Agent Guide

Guidance for AI agents and automated tools working in this repository. The
tooling is modeled on the [Lexical](https://github.com/facebook/lexical)
monorepo, so Lexical's conventions apply unless this file says otherwise.

mochinori is a separate project from Lexical: it is not part of Meta's
open source program and has no CLA. Do not add Meta copyright headers to
mochinori code. Code copied or adapted from Lexical keeps its original MIT
notice.

## Commands

- `pnpm install` - Install dependencies (pnpm 11, Node 24.15+; see `.nvmrc`)
- `pnpm run build` - Build the published packages into `dist/`
- `pnpm run build-website` - Build the Docusaurus site into
  `packages/mochinori-website/build`, then the Worker that serves it
- `pnpm run start:website` - Run the site with live reload
- `pnpm run test-unit` - Run unit tests (Vitest, jsdom by default)
- `pnpm run lint` / `lint:fix` - ESLint
- `pnpm run prettier` / `prettier:fix` - Prettier
- `pnpm run tsc`, `tsc-website` - TypeScript, per tsconfig
- `pnpm run ci-check` - Everything CI checks except tests and builds
- `pnpm run dev:website` - Build the site and run it with its API routes and
  Durable Objects in Vite/Miniflare (http://localhost:5173)
- `pnpm run deploy:website` - Build the site, then `void deploy --platform cloudflare`. Never
  deploy unless a person asked. Pushes to `main` deploy through
  `.github/workflows/deploy.yml`, and each pull request gets its own preview
  Worker through `.github/workflows/preview.yml`.

## Layout

- `packages/mochinori-<name>/` is the package `@mochinori/<name>`.
  - Published libraries (like `@mochinori/images`) build with plain `tsc`
    (`tsconfig.build.json`) into `dist/`.
  - `mochinori-website` is the Docusaurus docs and demos site. It must not
    be `"type": "module"` (Docusaurus breaks).
  - `mochinori-website-worker` is the [Void](https://void.cloud) app that
    deploys the site: `routes/` holds API routes (Hono handlers),
    `durable-objects/` holds Durable Objects (`defineDurableState`), and
    `void.config.ts` the Worker settings. Its static assets are the
    Docusaurus build. Keep Docusaurus out of this package's dependencies:
    Void 0.22.0 refuses to deploy a backend from a package that depends on
    `@docusaurus/core`. Commit `void.lock.json`; it records Durable Object
    migrations, which are append-only.
  - `mochinori-eslint-plugin-internal` holds lint rules for this repo.
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
- Optional chaining (`?.`) and nullish coalescing (`??`) are fine everywhere,
  including published packages. Lexical avoids them in its packages (its
  `no-optional-chaining` lint rule); mochinori does not carry that rule.
- Prefer extensions (`defineExtension`) over React plugins. Extensions whose
  behavior can be switched off take a `disabled` config and expose it as a
  signal with `namedSignals` (see `ImagesExtension`).

### Custom nodes

`ImageNode` in `@mochinori/images` is the reference.

1. Extend a base node class (`TextNode`, `ElementNode`, `DecoratorNode`).
   The constructor must work with no arguments.
2. Implement `$config()` with `this.config('type', {extends: BaseNode, json:
   schema})`, where `schema` is built with `nodeSchema<YourNode>()({...})`
   as a module-scope `const` above the class (like `imageNodeSchema`).
   Written inline in `$config()`, it makes TypeScript skip checking the
   class without a diagnostic. Declare every property inherent to the node
   in it, and declare each one stored verbatim in a field with
   `withField(stringValue(), {field: '__name'})`. Initialize that field in
   the class (`__name: string = '';`) so it is an own property of a fresh
   node. Use `withAccessors` only where a property is not a plain field.
3. Do not hand-write `clone`, `importJSON`, `exportJSON` or
   `updateFromJSON`: `$config` derives them from the schema, and it carries
   every property declared with `withField` across a clone. A field missing
   from the schema is not carried, so it is lost the first time a later
   update clones the node; declare it with `withField` rather than writing
   `afterCloneFrom`. Ad-hoc data that is not inherent to the node type
   belongs in NodeState (`createState`), which clones on its own. Write
   `afterCloneFrom` only for storage neither covers, such as a property
   declared through accessors on both sides whose value is not one field
   (one that is can name it, like Lexical's `MarkNode`:
   `setter: {field: '__ids', method: 'setIDs'}`). Call
   `super.afterCloneFrom(prevNode)` first, and copy every field of the
   class, schema fields included: Lexical does not add to a class's own
   `afterCloneFrom`. Test that a property survives a later update (see
   "keeps its properties when cloned by a later update").
4. Implement `createDOM()` and `updateDOM()` (and `decorate()` for a
   `DecoratorNode`). Keep `exportDOM()` on the class when the default export
   is not enough.
5. Never add `importDOM()`. Import HTML with a `defineImportRule` contributed
   through `configExtension(DOMImportExtension, {rules: [...]})` from an
   `*ImportExtension` that depends on `CoreImportExtension` (see
   `ImagesImportExtension`).
6. Register with an extension (`nodes: () => [YourNode]`).
7. Export a `$createYourNode()` factory built on `$create(YourNode)` and the
   node's setters, and a `$isYourNode()` guard.

The schema reference is Lexical's
[Serialization](https://lexical.dev/docs/serialization/) page.

### Shadow DOM and iframe realm safety

Editors can live inside a Shadow DOM or an `<iframe>`, so code that reaches
for the global `window` or `document` silently uses the wrong realm, and
Shadow DOM retargets selection and focus reads to the host. Use the helpers
exported from `lexical` instead:

| Instead of | Use |
| --- | --- |
| `window` | `element.ownerDocument.defaultView` |
| `window.getSelection()` | `getDOMSelection(rootElement.ownerDocument.defaultView)` |
| `selection.getRangeAt(0)` | `getDOMSelectionRange(selection, rootElement)` |
| `document` in `createDOM`/`updateDOM`/`exportDOM` | `$getDocument()` |
| `document` elsewhere | `getRootOwnerDocument(rootElement)` or `element.ownerDocument` |
| `document.activeElement` | `getActiveElement(element)` / `getActiveElementDeep(document)` |
| `event.target` | `getComposedEventTarget(event)` |
| `element.parentElement` | `getParentElement(element)` |
| `selection.anchorNode` / `focusNode` | `getDOMSelectionPoints(selection, rootElement)` |

ESLint enforces the first rows, as in Lexical, in every `packages/*/src`
directory, including the website's editor demos (`src/components`) but not
its pages or Docusaurus plugins:

- `no-restricted-syntax` rejects any `document.*` or `window.*` member access
  (a `typeof window` SSR guard is fine).
- `@lexical/no-document-in-dom-methods` rejects `document` inside
  `createDOM`/`updateDOM`/`exportDOM` and autofixes it to `$getDocument()`.
- `@lexical/rules-of-lexical` is an error here (Lexical runs it as a
  warning), so a `$` function called outside an update, read, transform,
  command handler or another `$` function fails CI.

The other rows involve local variables that lint cannot see, so review
catches them.

## Backwards compatibility

Once a package is published, changes must be backwards compatible: keep
exported APIs and the serialized JSON of nodes working, add rather than
rename, and deprecate before removing.

## Testing

- Unit tests live in `**/__tests__/unit/**/*.test.{ts,tsx}`. Add
  `// @vitest-environment node` as the first line of tests that need no DOM.
- Build editors in tests with `buildEditorFromExtensions` and dispose them
  (`using editor = ...`).

## Commits and pull requests

Write commit messages and PR descriptions to the shape of
`.github/pull_request_template.md`: a `[packages] Type: title` subject, a
`## Description`, and a `## Test plan` with real `### Before` and
`### After` output. Never include agent session URLs or other private links.
