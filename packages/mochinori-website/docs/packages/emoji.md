---
title: '@mochinori/emoji'
---

# `@mochinori/emoji`

Emoji for Lexical. Typing a short name such as `:tada:` or
`:man-facepalming:`, or a smiley such as `:)` followed by a space, replaces it
with an `EmojiNode`. Emoji are drawn with the 64×64 images from
[emoji-datasource-facebook](https://github.com/iamcal/emoji-data), so they
look the same on every platform. Apps can add custom emoji beyond Unicode,
like a Slack workspace or a Discord server, and change them while the editor
runs.

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

## Custom emoji

A custom emoji is a name and an image. Typing `:name:` turns into a
`CustomEmojiNode`:

```ts
configExtension(EmojiExtension, {
  customEmoji: [{name: 'partyparrot', src: '/emoji/partyparrot.gif'}],
});
```

The set can change while the editor runs, for example when someone uploads a
new emoji. Set the extension's `customEmoji` output signal:

```ts
const {customEmoji} = getExtensionDependencyFromEditor(
  editor,
  EmojiExtension,
).output;
customEmoji.value = [...customEmoji.value, {name: 'mochi', src: mochiUrl}];
```

- A `CustomEmojiNode` stores only the name, so documents show whatever
  image the app has for that name now. A name the app no longer has shows
  as `:name:` text, the way chat apps show a deleted emoji.
- Shortcodes typed before their emoji existed turn into emoji once it is
  added.
- A standard emoji with the same short name wins over a custom one.
- In plain text (copy, `getTextContent()`) a custom emoji is `:name:`.
- It exports to HTML as `<span data-custom-emoji="name"><img …></span>`,
  so other apps show the image, and `EmojiImportExtension` imports it back
  by name.

Style it with `customEmojiClass`, for example
`.mochinori-custom-emoji img { width: 1.25em; height: 1.25em; vertical-align: -0.25em; }`.

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
| `customEmoji` | `[]` | Custom emoji (`{name, src}`), the initial value of the `customEmoji` output signal |
| `customEmojiClass` | `'mochinori-custom-emoji'` | Class of every custom emoji |
| `parseEmojiReplacementEntry` | `parseEmojiShortNamesAndTexts` | Which texts to replace: `parseEmojiShortNames` (only `:short_name:`), `parseEmojiTexts` (only smileys like `:)`), or your own function |

Its output has `customEmoji`, a signal of the custom emoji to set while the
editor runs, and `customEmojiByName`, the same as a `Map`.

### `EmojiImportExtension`

Adds import rules to `DOMImportExtension` that turn the
`data-emoji-shortcode` element `EmojiNode` exports back into an `EmojiNode`,
and the `data-custom-emoji` element back into a `CustomEmojiNode`.
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

### `CustomEmojiNode`

An inline `DecoratorNode`, rendered without React. It serializes as
`{"type": "custom-emoji", "version": 1, "name": "partyparrot"}`. Create one
with `$createCustomEmojiNode(name)` and test for one with
`$isCustomEmojiNode(node)`.

### `findEmoji(text)` and `createEmojiMatcher(parser, customEmoji?)`

`findEmoji` returns the first shortcode in a string, its position and its
emoji, or `null`. `createEmojiMatcher` returns the same kind of function for
another `parseEmojiReplacementEntry`, and also matches the `:name:` of a map
of custom emoji (the match then has `custom` set).

### `unifiedIDFromText(emoji)` and `textFromUnifiedID(id)`

Convert between an emoji and its unified id, such as `1f642` for 🙂.
