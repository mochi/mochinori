---
title: '@mochinori/emoji'
---

# `@mochinori/emoji`

Emoji for Lexical. Typing a short name such as `:tada:` or
`:man-facepalming:`, or a smiley such as `:)` followed by a space, replaces it
with an `EmojiNode`. Emoji are drawn with the 64×64 images from
[emoji-datasource-facebook](https://github.com/iamcal/emoji-data), so they
look the same on every platform.

:::info Status

Ported from `@etrepum/lexical-emoji-extension` in
[lexical-builder](https://github.com/etrepum/lexical-builder). Not published to
npm yet.

:::

[Try it in the demos](/demos#emoji).

## Usage

```ts
import {EmojiExtension, EmojiImportExtension} from '@mochinori/emoji';
import {defineExtension} from 'lexical';

const AppExtension = defineExtension({
  dependencies: [
    EmojiExtension,
    // Optional: import pasted or loaded HTML emoji with their shortcode
    EmojiImportExtension,
  ],
  name: '@my-app/Editor',
});
```

Then style the emoji, for example:

```css
.mochinori-emoji {
  display: inline-block;
  width: 1em;
  height: 1em;
  background: center / 1em 1em no-repeat;
  vertical-align: top;
}

/* The image has loaded: hide the font's emoji behind it */
.mochinori-emoji--loaded {
  color: transparent;
}
```

## How it loads

The emoji database (about 36 KB) is loaded with a dynamic `import()`, so
bundlers put it in its own chunk, and it is only fetched when an editor with
`EmojiExtension` is created. Node and other non-browser runtimes load it
synchronously, so a headless editor converts shortcodes from its first update.

Each emoji's image is loaded with the page's own document. Until it loads,
the font's emoji is shown.

Shortcodes are only converted while the editor is editable. When a
read-only editor becomes editable, any shortcodes in it are converted.

## API

### `EmojiExtension`

Registers `EmojiNode`, converts shortcodes, and loads each emoji's image.

| Config | Default | Description |
| --- | --- | --- |
| `emojiBaseUrl` | emoji-datasource-facebook on jsDelivr | Where the `<unified id>.png` images are, without a trailing slash. To serve them yourself, copy `img/facebook/64` from `emoji-datasource-facebook@15.1.2` (`EMOJI_DATASOURCE_VERSION`). |
| `emojiClass` | `'mochinori-emoji'` | Class of every emoji |
| `emojiLoadingClass` | `''` | Added until the image loads |
| `emojiLoadedClass` | `'mochinori-emoji--loaded'` | Added once the image loads |
| `parseEmojiReplacementEntry` | `parseEmojiShortNamesAndTexts` | Which texts to replace: `parseEmojiShortNames` (only `:short_name:`), `parseEmojiTexts` (only smileys like `:)`), or your own function |

### `EmojiImportExtension`

Adds an import rule to `DOMImportExtension` that turns the
`data-emoji-shortcode` element `EmojiNode` exports back into an `EmojiNode`.
HTML paste uses it when the editor also has `ClipboardDOMImportExtension`.

### `EmojiNode`

A `TextNode` in token mode, so it is deleted as a unit. It serializes as:

```json
{
  "type": "emoji",
  "version": 1,
  "text": "🙂",
  "shortcode": ":)",
  "mode": "token",
  "detail": 0,
  "format": 0,
  "style": ""
}
```

Create one with `$createEmojiNode(emoji, shortcode)` and test for one with
`$isEmojiNode(node)`.

### `findEmoji(text)` and `createEmojiMatcher(parser)`

`findEmoji` returns the first shortcode in a string, its position and its
emoji, or `null`. `createEmojiMatcher` returns the same kind of function for
another `parseEmojiReplacementEntry`.

### `unifiedIDFromText(emoji)` and `textFromUnifiedID(id)`

Convert between an emoji and its unified id, such as `1f642` for 🙂.
