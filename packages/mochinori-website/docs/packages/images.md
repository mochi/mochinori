---
title: '@mochinori/images'
---

# `@mochinori/images`

A full-featured image node for Lexical, modeled on the `ImageNode` in the
Lexical playground and packaged as a library.

:::info Status

This package is an early scaffold. `ImageNode` (inline and block images),
`ImagesExtension`, `INSERT_IMAGE_COMMAND`, captions, alt text editing,
selection, drag and drop, and uploads (`ImageUploadExtension`) work today.
Resizing is next.

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

## Inline and block images

An image is either inline, part of a paragraph's text like a word, or a
block: a figure of its own between paragraphs, which can have a caption.
CKEditor 5 and WordPress work the same way. Inline images never have
captions, because a `<figure>`
can't go inside a paragraph.

The `block` property says which an image is. Changing it moves the image:
a block image dropped or inserted into a paragraph splits the paragraph,
and an inline image left between paragraphs gets one of its own. Giving an
image a caption makes it a block, and making it inline removes its caption.

`INSERT_IMAGE_COMMAND`, paste and the file dialog insert a block image when
the caret is on an empty line, and an inline image in text, unless the
payload sets `block`.

## API

### `ImagesExtension`

Registers `ImageNode`, handles `INSERT_IMAGE_COMMAND`, and makes images
interactive:

- **Selection.** Clicking an image selects it, and shift-clicking adds it to
  the selected nodes. Backspace or Delete removes the selected images.
- **Drag and drop.** Drag an image to move it, caption and all, anywhere in
  the text. Images can't be dropped into a caption. Dragged out of the
  editor, an image carries its URL and an `<img>` as HTML, so another
  editor with `ImagesExtension` imports it.
- **Image tools.** A selected image shows *Alt text*, *Add caption* (or
  *Remove caption*) and *Make block* (or *Make inline*) buttons. *Alt text*
  opens a field: Enter saves, Escape cancels, and leaving the field saves.
  The buttons dispatch `SET_IMAGE_ALT_TEXT_COMMAND`,
  `SET_IMAGE_CAPTION_COMMAND` and `SET_IMAGE_BLOCK_COMMAND`, which apps can
  dispatch too.
- **Captions.** In a caption, Enter does nothing, Escape selects the image,
  the arrow keys leave the caption at either end, and Backspace in an empty
  caption removes it.

None of these work while the editor is read-only. The extension has no
configuration.

### `ImageNode`

A `DecoratorNode` of type `mn:image` (mochinori's node types all start
with `mn:`, so they don't collide with an app's own `image` node while it
moves to this one). Its JSON follows this
[schema](https://lexical.dev/docs/serialization/), which `$config` derives
`exportJSON` and `importJSON` from:

```ts
const imageNodeSchema = nodeSchema<ImageNode>()({
  altText: withField(stringValue(), {field: '__altText'}),
  block: withField(booleanValue(), {field: '__block'}),
  height: withField(optional(numberValue()), {field: '__height'}),
  src: withField(stringValue(), {field: '__src'}),
  width: withField(optional(numberValue()), {field: '__width'}),
});
```

| Property | Type | Default |
| --- | --- | --- |
| `src` | string | `''` |
| `altText` | string | `''` |
| `block` | boolean | `false` (inline) |
| `width` | number, CSS pixels | absent (natural size) |
| `height` | number, CSS pixels | absent (natural size) |
| `$slots.caption` | a paragraph node | absent (no caption); block images only |

The [compact JSON](https://lexical.dev/docs/serialization/#compact-json)
form (`editorState.toJSON(true)`) leaves out every property at its default.

The caption is a paragraph in the image's `caption`
[named slot](https://lexical.dev/docs/concepts/named-slots), not a nested
editor. It lives in the editor's own state, so its text is edited with the
editor's own formatting, links and history, is part of the document's text
content, and serializes and syncs (with `@lexical/yjs`) with everything
else. `getCaption()` returns it, `hasCaption()` tests for it, and
`setCaption()` adds an empty one, `setCaption(paragraph)` replaces it and
`setCaption(null)` removes it; adding one makes the image a block.
`isBlock()` and `setBlock(block)` read and change the kind. Named slots are
`@experimental` in Lexical.

An inline image exports to `<img>` HTML, and a block image to `<figure>`,
with a `<figcaption>` when it has a caption.

`ImagesExtension` also adds `ImageImportRule` and `ImageFigureImportRule`
(together, `ImagesImportRules`) to `@lexical/html`'s `DOMImportExtension`,
the same way Lexical's own extensions register theirs, so HTML imported
through that pipeline turns `<img>` into an inline `ImageNode`, and a
`<figure>` with one `<img>` into a block `ImageNode` with the text of its
`<figcaption>`, if any, as the caption (pasted from Wikipedia, for example).
Pasted HTML goes through the pipeline when the editor also has
`ClipboardDOMImportExtension` from `@lexical/clipboard`, and
`$generateNodesFromDOM` from `DOMImportExtension`'s output uses it too.
Images whose `src` is a local `file:///` path are skipped, because they can
never load in the editor. `ImageNode` has no legacy `importDOM`, so HTML
import goes through these rules only.

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
`width`, `height`, `block` and `caption`), and test whether a node is one.
Any `caption` string, even `''`, gives the image a caption and makes it a
block.

### Styling

The node's element has the `image` theme class: a `<div>` for a block
image and a `<span>` for an inline one. Inside it, `ImageComponent` renders
this markup for a block image with a caption:

```html
<figure class="mochinori-image-frame" data-selected>
  <span class="mochinori-image-media">
    <img class="mochinori-image focused" />
    <!-- progress bar, upload error, and the image tools while selected -->
  </span>
  <figcaption class="mochinori-image-caption">
    <span class="mochinori-image-caption-slot"><!-- the caption --></span>
    <span class="mochinori-image-caption-placeholder">Write a caption…</span>
  </figcaption>
</figure>
```

The `<figcaption>` names the figure for screen readers. An inline image
renders `<span class="mochinori-image-frame">` instead of a `<figure>`,
since it is just an image in the text. Reset the browser's default `figure`
margin on `mochinori-image-frame`.

`mochinori-image-media` is the box the progress bar, error, the
`mochinori-image-tools` buttons and the `mochinori-image-alt-editor` form
are positioned in. The demo's
stylesheet keeps a caption no wider than its image with `width: 0;
min-width: 100%` on `mochinori-image-caption`.

## Roadmap

- Resizing with handles, keeping the aspect ratio
- Suggested alt text from a vision model, for the demo
