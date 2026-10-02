---
title: '@mochinori/images'
---

# `@mochinori/images`

A full-featured image node for Lexical, modeled on the `ImageNode` in the
Lexical playground and packaged as a library.

:::info Status

This package is an early scaffold. `ImageNode`, `ImagesExtension`,
`INSERT_IMAGE_COMMAND` and uploads (`ImageUploadExtension`) work today.
Resizing and captions are next.

:::

[Try it in the demos](/demos#images).

## Usage

```ts
import {ImagesExtension, INSERT_IMAGE_COMMAND} from '@mochinori/images';

// Add ImagesExtension to your editor's dependencies, then:
editor.dispatchCommand(INSERT_IMAGE_COMMAND, {
  altText: 'A mochi',
  src: 'https://example.com/mochi.png',
  width: 320,
  height: 240,
});
```

## API

### `ImagesExtension`

Registers `ImageNode` and handles `INSERT_IMAGE_COMMAND`.

| Config | Default | Description |
| --- | --- | --- |
| `disabled` | `false` | When `true`, `INSERT_IMAGE_COMMAND` is not handled. Also exposed as a signal on the extension's output. |

### `ImageNode`

An inline `DecoratorNode` rendered as an `<img>`. It serializes as:

```json
{
  "type": "image",
  "version": 1,
  "src": "https://example.com/mochi.png",
  "altText": "A mochi",
  "width": 320,
  "height": 240
}
```

`width` and `height` are omitted when unknown. The node exports to `<img>`
HTML. HTML import goes through `ImagesImportExtension` only.

### `ImagesImportExtension`

Adds `ImageImportRule` to `@lexical/html`'s `DOMImportExtension`, so pasted
HTML and `$generateNodesFromDOM` turn `<img>` into `ImageNode`. It depends on
`ImagesExtension` and `CoreImportExtension`. Images whose `src` is a local
`file:///` path are skipped, because they can never load in the editor.
`ImageNode` has no legacy `importDOM`, so add this extension wherever images
should be imported from HTML.

### `ImageUploadExtension`

Inserts image files from paste, drag and drop, or a file dialog, and uploads
them in the background. Each image appears right away with a local `blob:`
URL, dimmed with a progress bar. When the upload finishes, the extension
preloads the uploaded image and only then swaps the node's `src` to it, so
the image never flickers. The swap is merged into the insertion's undo step.
A failed upload shows an error with a Retry button.

```ts
import {configExtension, defineExtension} from 'lexical';
import {
  createHttpImageUploader,
  ImageUploadExtension,
} from '@mochinori/images';

const AppExtension = defineExtension({
  dependencies: [
    configExtension(ImageUploadExtension, {
      upload: createHttpImageUploader({url: '/api/images'}),
    }),
  ],
  name: '@my-app/Editor',
});
```

| Config | Default | Description |
| --- | --- | --- |
| `disabled` | `false` | When `true`, files are not inserted or uploaded. |
| `upload` | `null` | `(file, {signal, onProgress}) => Promise<{src}>`. Without one, images keep their local URL. |
| `mirror` | `null` | `(src, {signal}) => Promise<{src}>`. Copies images from other origins (such as `<img>` in HTML pasted from another site) to your storage. Without one, they keep their remote URL. |
| `isHostedSrc` | `null` | Whether an `http(s)` image is already yours, so it is not mirrored. Images the extension uploaded or mirrored always are. When `null`, images from the editor's own origin are. |
| `inlineDataUrlMaxLength` | `1024` | `data:` URLs up to this length stay inline in the document; longer ones are uploaded. `blob:` URLs are always uploaded. |
| `accept` | PNG, JPEG, GIF, WebP, AVIF | MIME types accepted. SVG is left out because it can carry script. |
| `maxFileSize` | 10 MB | Larger images are not uploaded. Without `prepareUpload`, larger files are rejected before they are inserted. With it, the limit applies to what `prepareUpload` returns, and an image still over it shows "Image is too large to upload." |
| `prepareUpload` | `null` | `(image, {signal}) => Promise<Blob>`. Runs on each local image before upload. Use `createImageResizer()` to downscale photos. |
| `onReject` | `null` | Called with the file and `'type'` or `'size'` for each file that is not inserted. |

The output has signals `uploads` (state per local URL) and `pendingCount`,
and functions `openFileDialog()`, `retry(localSrc)` and `waitForUploads()`.
Await `waitForUploads()` before saving, so the saved JSON has no local URLs.
`INSERT_IMAGE_FILES_COMMAND` inserts a `File[]` directly.

A mirrored image keeps showing from its remote URL while the copy is made,
and switches to the copy the same way an upload does. Mirroring happens on
the server, because browsers can't read most images from other origins.

### `createHttpImageUploader({url})` and `createHttpImageMirror({url})`

An uploader that POSTs the file as the raw request body, with its type as
`Content-Type`, and reports upload progress. The server answers with JSON
`{"src": "..."}` (resolved against the response URL), or an error status
with `{"error": "..."}`. `createHttpImageMirror` POSTs
`{"url": "<remote url>"}` as JSON to the same kind of endpoint, which
fetches the image itself and answers the same way. The demo site's Worker implements this endpoint on
R2, and deletes uploads after an hour.

### `createImageResizer({maxWidth, maxHeight, maxBytes, quality, type})`

A `prepareUpload` function that re-encodes images in the browser when they
are larger than `maxWidth` × `maxHeight` (2048 × 2048 by default) or
`maxBytes` (no limit by default). It keeps the aspect ratio, the EXIF
orientation and, where the browser supports it, Display P3 color. An image
over `maxBytes` is re-encoded at full size first, then made smaller step by
step until it fits. JPEG photos stay JPEG at `quality` (0.92 by default)
and other images become WebP where the browser can encode it, unless `type`
asks for another format. WebP is usually 25–35% smaller than JPEG at the
same quality, but not every browser can encode it from a canvas, so a
`type` the browser can't produce falls back to that default. No browser can
encode AVIF from a canvas; for AVIF, keep the original and convert it when
serving (for example with Cloudflare Images). Re-encoding drops
EXIF metadata such as location. Images within every limit, GIFs (which may
be animated) and images the browser can't decode are uploaded byte for byte.

Without `prepareUpload`, the extension uploads every file unchanged. To stay
as close to that as possible while still fitting a server's upload limit,
lift the dimension limits and set only `maxBytes`:

```ts
createImageResizer({
  maxBytes: 5 * 1024 * 1024,
  maxHeight: Infinity,
  maxWidth: Infinity,
});
```

The demo on this site instead shrinks images early (1600 × 1600, 1 MB,
quality 0.8, WebP) to keep its storage small.

### `$createImageNode(payload)` and `$isImageNode(node)`

Create an `ImageNode` from an `ImagePayload` (`src`, and optional `altText`,
`width` and `height`), and test whether a node is one.

## Roadmap

- Resizing with handles, keeping the aspect ratio
- Captions as nested editors
