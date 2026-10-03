---
title: Collaboration on Cloudflare
---

# Collaboration on Cloudflare

The [collaboration demo](/demos#collaboration) runs Lexical's Yjs bindings
(`@lexical/yjs`) against a server on this site's own Worker. Each document
is one [Durable Object](https://developers.cloudflare.com/durable-objects/),
so every client editing a document talks to the same single-threaded
instance, which holds the document in memory and stores it in that object's
SQLite database.

## The pieces

- **Server:**
  `packages/mochinori-website-worker/durable-objects/collab.ts` defines
  `CollabDocument`, a subclass of
  [y-partyserver](https://github.com/cloudflare/partykit/tree/main/packages/y-partyserver)'s
  `YServer`. It speaks the standard Yjs WebSocket protocol (sync and
  awareness), so any y-websocket compatible provider can connect to it.
- **Route:** `routes/api/collab/[doc].ts` forwards the WebSocket upgrade for
  `/api/collab/<doc>` to the Durable Object named `<doc>`.
- **Client:** the demo creates y-partyserver's `YProvider` with
  `prefix: '/api/collab/<doc>'` and hands it to Lexical's
  `CollaborationPlugin` through `providerFactory`. Nothing in Lexical needs
  to change: `YProvider` is a drop-in for y-websocket's `WebsocketProvider`.

## Storage and lifetime

Every Yjs update is appended to a `yjs_updates` table as it arrives, so an
edit is durable as soon as the server has seen it. y-partyserver calls
`onSave` a couple of seconds after editing pauses, and once the log holds
more than 500 updates `onSave` folds it into a single snapshot (split into
1 MB parts, since a SQLite row holds at most 2 MB). On startup `onLoad`
applies the snapshot and then the log.

The sockets use the
[Hibernation API](https://developers.cloudflare.com/durable-objects/best-practices/websockets/),
so a document whose editors are idle is evicted from memory without
dropping them, and reloads from SQLite on the next message.

The demo keeps a document for an hour after its last edit or visit, like its
uploaded images. Each edit, connection and disconnection moves an alarm an
hour ahead; when it fires with nobody connected, the object deletes its
storage.

## How it fits into Void

Void's `durable-objects/` directory expects each module to default-export a
`defineDurableState()` definition, and Void generates the Durable Object
class from it. That class can't hold hibernating WebSockets, and Void's own
WebSocket rooms (`defineRoom`) carry JSON only, while Yjs sends binary
frames.

Void's generated Worker entry, however, only reads two things from that
default export: it calls `__bind(bindingName)` and exports its `class`
property as the Durable Object class. `collab.ts` default-exports
`{class: CollabDocument, __bind() {}}`, so Void exports y-partyserver's
class as `CollabDurableObject`, binds it as `COLLAB`, and records its SQLite
migration in `void.lock.json` like any other Durable Object.

This relies on Void internals, not a documented API. Before upgrading Void,
check that `pnpm --filter @mochinori/website-worker run build:worker` still
exports `CollabDurableObject` from `dist/ssr/index.js`, and that the
`durable_objects` bindings in `dist/ssr/wrangler.json` still list it.

## Deploying a new Durable Object class

Adding, renaming or removing a Durable Object class is a Cloudflare class
migration, which Void's staged deploys refuse on an existing Worker. Deploy
such a change once with an atomic publish, either from your machine:

```sh
pnpm run deploy:website --atomic
```

or by running the **Deploy** workflow from the Actions tab with **atomic**
checked. Pull request previews deploy a new Worker each time, so they don't
need it.

## A server-side participant

The server holds the live `Y.Doc` (`this.document`), so it can also take
part in editing. To work with Lexical nodes rather than raw Yjs types, run a
headless Lexical editor bound to that document with `@lexical/yjs`'s
`createBinding` and a no-op provider, as in Lexical's
[collaboration FAQ](https://lexical.dev/docs/collaboration/faq). Its
changes are ordinary Yjs updates, which y-partyserver broadcasts to every
client. Possible uses are seeding new documents on the server (instead of a
client's `shouldBootstrap`), exporting a document to JSON or HTML, or
applying edits from an API route. Run such a participant on demand rather
than keeping an editor alive for every open document.
