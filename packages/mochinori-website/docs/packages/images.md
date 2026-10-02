---
title: '@mochinori/images'
---

# `@mochinori/images`

A full-featured image node for Lexical, modeled on the `ImageNode` in the
Lexical playground and packaged as a library.

:::info Status

This package is an early scaffold. `ImageNode`, `ImagesExtension`,
`INSERT_IMAGE_COMMAND`, captions, selection, drag and drop, and uploads
(`ImageUploadExtension`) work today. Resizing is next.

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

Registers `ImageNode`, handles `INSERT_IMAGE_COMMAND`, and makes images
interactive:

- **Selection.** Clicking an image selects it, and shift-clicking adds it to
  the selected nodes. Backspace or Delete removes the selected images.
- **Drag and drop.** Drag an image to move it, caption and all, anywhere in
  the text. Images can't be dropped into a caption. Dragged out of the
  editor, an image carries its URL and an `<img>` as HTML, so another
  editor with `ImagesImportExtension` imports it.
- **Captions.** A selected image shows an *Add caption* button. In a caption,
  Enter does nothing, Escape selects the image, the arrow keys leave the
  caption at either end, and Backspace in an empty caption removes it.

None of these work while the editor is read-only. The extension has no
configuration.

### `ImageNode`

An inline `DecoratorNode` rendered as an `<img>`. It serializes as:

```json
{
  "type": "image",
  "version": 1,
  "src": "https://example.com/mochi.png",
  "altText": "A mochi",
  "width": 320,
  "height": 240,
  "$slots": {
    "caption": {"type": "paragraph", "version": 1, "children": [...]}
  }
}
```

`width` and `height` are omitted when unknown, and `$slots` when there is
no caption.

The caption is a paragraph in the image's `caption`
[named slot](https://lexical.dev/docs/concepts/named-slots), not a nested
editor. It lives in the editor's own state, so its text is edited with the
editor's own formatting, links and history, is part of the document's text
content, and serializes and syncs (with `@lexical/yjs`) with everything
else. `getCaption()` returns it, `hasCaption()` tests for it, and
`setCaption()` adds an empty one, `setCaption(paragraph)` replaces it and
`setCaption(null)` removes it. Named slots are `@experimental` in Lexical.

The node exports to `<img>` HTML, or to `<figure>` with a `<figcaption>`
when it has a caption. HTML import goes through `ImagesImportExtension`
only.

### `ImagesImportExtension`

Adds `ImageImportRule` and `ImageFigureImportRule` to `@lexical/html`'s
`DOMImportExtension`, so pasted HTML and `$generateNodesFromDOM` turn `<img>`
into `ImageNode`, and a `<figure>` with one `<img>` into an `ImageNode` with
the text of its `<figcaption>` as the caption (pasted from Wikipedia, for
example). It depends on
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
| `prepareUpload` | `null` | `(image, {signal, maxFileSize}) => Promise<Blob>`. Runs on each local image before upload. Use `createImageResizer()` to shrink only images over the limit. |
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

### `createImageResizer({maxBytes, maxWidth, maxHeight, quality, type})`

A `prepareUpload` function that uploads every image that fits `maxBytes`
(by default the extension's `maxFileSize`) byte for byte, and re-encodes
larger ones in the browser until they fit: first at full size, or at most
`maxWidth` × `maxHeight` when those are set, then smaller step by step.
Re-encoding keeps the aspect ratio, the EXIF orientation and, where the
browser supports it, Display P3 color, and it drops EXIF metadata such as
location. GIFs (which may be animated) and images the browser can't decode
are never re-encoded.

JPEG photos are re-encoded as JPEG at `quality` (0.92 by default) and other
images as WebP where the browser can encode it, unless `type` asks for
another format. WebP is usually 25–35% smaller than JPEG at the same
quality, but not every browser can encode it from a canvas, so a `type` the
browser can't produce falls back to that default. No browser can encode
AVIF from a canvas; for AVIF, keep the original and convert it when serving
(for example with Cloudflare Images).

```ts
// Upload originals whenever they fit maxFileSize; shrink only the rest
configExtension(ImageUploadExtension, {
  maxFileSize: 5 * 1024 * 1024,
  prepareUpload: createImageResizer(),
  upload,
});
```

The demo on this site uploads images up to 1 MB as they are and shrinks
larger ones to 1600 × 1600 WebP at quality 0.8, to keep its storage small.

### `$createImageNode(payload)` and `$isImageNode(node)`

Create an `ImageNode` from an `ImagePayload` (`src`, and optional `altText`,
`width`, `height` and `caption`), and test whether a node is one. Any
`caption` string, even `''`, gives the image a caption.

### Styling

`ImageComponent` renders this markup inside the node's element (the
`image` theme class):

```html
<span class="mochinori-image-frame" data-selected>
  <span class="mochinori-image-media">
    <img class="mochinori-image focused" />
    <!-- progress bar, upload error and the caption button -->
  </span>
  <span class="mochinori-image-caption">
    <span class="mochinori-image-caption-slot"><!-- the caption --></span>
    <span class="mochinori-image-caption-placeholder">Write a caption…</span>
  </span>
</span>
```

`mochinori-image-media` is the box the progress bar, error and
`mochinori-image-caption-toggle` button are positioned in. The demo's
stylesheet keeps a caption no wider than its image with `width: 0;
min-width: 100%` on `mochinori-image-caption`.

## Roadmap

- Resizing with handles, keeping the aspect ratio
