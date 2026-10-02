---
sidebar_position: 1
slug: /intro
---

# Introduction

**mochinori** is a collection of batteries-included extensions for
[Lexical](https://lexical.dev), the extensible text editor framework.

Lexical gives you a small, fast core and leaves features like images, embeds
and uploads to you. The Lexical playground shows what those features can look
like, but its code is a demo, not a library. mochinori turns those ideas into
packages you can install, configure and ship.

## Packages

| Package | Status | What it does |
| --- | --- | --- |
| [`@mochinori/images`](./packages/images.md) | In progress | An image node with upload, resizing and captions |

## Principles

- **Built on Lexical, never forked.** Every package depends on the published
  `lexical` and `@lexical/*` packages as peer dependencies, so your app keeps
  exactly one copy of Lexical.
- **Extensions first.** Each package exports a Lexical extension you add to
  your editor with `buildEditorFromExtensions` or `LexicalExtensionComposer`.
- **Works where Lexical works.** Packages run headless as well as in the
  browser, and follow Lexical's rules for editors inside Shadow DOM and
  iframes.
