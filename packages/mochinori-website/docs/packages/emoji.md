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

A custom emoji is a name and an image. Typing `:name:` turns into an
`EmojiNode` with that name:

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

To fetch the set when an editor is created instead of configuring it up
front, give `loadCustomEmoji`. Shortcodes typed while it loads convert once
it arrives:

```ts
configExtension(EmojiExtension, {
  loadCustomEmoji: async signal => {
    const response = await fetch('/api/emoji', {signal});
    return response.json();
  },
});
```

For a large set, like a Slack workspace with thousands of emoji, give
`lookupCustomEmoji` instead, and the editor asks for emoji as they are
needed: for the start of a name as it is typed, once two characters follow
the `:` (`customEmojiLookupMinLength`), so the emoji is usually there by the
closing `:`, and for each `:name:` or custom emoji in the document whose
name it doesn't know yet. Return the emoji whose names start with the query;
they are added to `customEmoji`, and each query is asked once per editor:

```ts
configExtension(EmojiExtension, {
  lookupCustomEmoji: async (query, signal) => {
    const url = `/api/emoji?prefix=${encodeURIComponent(query)}`;
    return (await fetch(url, {signal})).json();
  },
});
```

- The node stores only the name, so documents show whatever
  image the app has for that name now. A name the app no longer has shows
  as `:name:` text, the way chat apps show a deleted emoji.
- Shortcodes typed before their emoji existed turn into emoji once it is
  added.
- A standard emoji with the same short name wins over a custom one.
- In plain text (copy, `getTextContent()`) a custom emoji is `:name:`.
- In the editor, the `:name:` text stays in the document at zero size, and
  the image is the element's background, so the arrow keys, clicks and
  Shift-selection treat the emoji as one character and screen readers read
  its name (`role="img"`).
- It exports to HTML as `<span data-custom-emoji="name"><img …></span>`,
  so other apps show the image, and `EmojiImportExtension` imports it back
  by name.

The image's size and position are inline styles (1.25em square). The
`customEmojiClass` class is there for anything else, such as a hover
effect.

## Suggestions and pickers

Like Slack and Discord, the editor can suggest emoji while `:app` is typed,
and an emoji picker can insert them. Both are headless: the package keeps
the state and handles the keys, and the app draws the UI with React,
Svelte, plain DOM or anything else.

Add `EmojiTypeaheadExtension` for suggestions. Its `state` output signal is
null while the menu is closed; otherwise it has the `query`, the
`suggestions` (each with a `name`, the Unicode `emoji` or the `custom`
emoji, and the `src` of its image), the `selectedIndex`, and `getRect()`
for where the `:query` is on screen. It opens once two characters follow
the `:` (`minLength`), shows up to eight (`limit`), and handles Up, Down,
Enter, Tab and Escape itself. Picking replaces the `:query` with the emoji
and a space. With plain DOM:

```ts
const {state, select, setSelectedIndex} = getExtensionDependencyFromEditor(
  editor,
  EmojiTypeaheadExtension,
).output;
const menu = document.createElement('ul');
menu.role = 'listbox';
document.body.append(menu);
effect(() => {
  const current = state.value;
  menu.hidden = current === null;
  const rect = current?.getRect();
  if (!current || !rect) {
    return;
  }
  Object.assign(menu.style, {
    left: `${rect.left}px`,
    position: 'fixed',
    top: `${rect.bottom + 4}px`,
  });
  menu.replaceChildren(
    ...current.suggestions.map((suggestion, index) => {
      const item = document.createElement('li');
      item.role = 'option';
      item.ariaSelected = String(index === current.selectedIndex);
      const img = document.createElement('img');
      img.src = suggestion.src;
      img.alt = '';
      item.append(img, `:${suggestion.name}:`);
      // Keep the caret in the editor
      item.onmousedown = event => event.preventDefault();
      item.onclick = () => select(index);
      item.onmouseenter = () => setSelectedIndex(index);
      return item;
    }),
  );
});
```

The [demo](/demos#emoji) renders the same state with React, and marks the
editor as a combobox for screen readers (`aria-expanded`,
`aria-activedescendant`).

For a picker, `EmojiExtension`'s `searchEmoji` output signal holds a search
over the standard and custom emoji once the database has loaded (null
before), and `getEmojiSrc(suggestion)` gives each one's image. Insert the
emoji the person picks with `INSERT_EMOJI_COMMAND`:

```ts
const {searchEmoji, getEmojiSrc} = getExtensionDependencyFromEditor(
  editor,
  EmojiExtension,
).output;
const results = searchEmoji.value?.('pizza', {limit: 40}) ?? [];
editor.dispatchCommand(INSERT_EMOJI_COMMAND, results[0]);
```

Search ranks a name that is the query first, then names that start with
it, then names with a word that starts with it (`green_apple`), then names
that contain it (`pineapple`); custom emoji come first within each.

## How it loads

The emoji database (about 36 KB) is loaded with a dynamic `import()`, so
bundlers put it in its own chunk, and it is only fetched when an editor with
`EmojiExtension` is created. Node and other non-browser runtimes load it
synchronously, so a headless editor converts shortcodes from its first update.
Text typed before the database arrives is converted when it does. If it
fails to load (for example, offline), the error goes to the editor's
`onError` and the next editor tries again; an editor disposed before it
arrives is left alone.

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
| `loadCustomEmoji` | `undefined` | `(abortSignal) => Promise<CustomEmoji[]>`, called when an editor is created; the result is added to `customEmoji`. The signal aborts on dispose, and a rejection goes to the editor's `onError` |
| `lookupCustomEmoji` | `undefined` | `(query, abortSignal) => Promise<CustomEmoji[]>`, asked for the start of a typed name and for unknown names in the document; the result is added to `customEmoji`. The signal aborts on dispose, and a rejection goes to the editor's `onError` |
| `customEmojiLookupMinLength` | `2` | How much of a name is typed after the `:` before `lookupCustomEmoji` is asked |
| `customEmojiClass` | `'mochinori-custom-emoji'` | Class of every custom emoji |
| `parseEmojiReplacementEntry` | `parseEmojiShortNamesAndTexts` | Which texts to replace: `parseEmojiShortNames` (only `:short_name:`), `parseEmojiTexts` (only smileys like `:)`), or your own function |

Its output has `customEmoji`, a signal of the custom emoji to set while the
editor runs, `customEmojiByName`, the same as a `Map`, `searchEmoji`, a
signal of a search over both (null until the database loads), and
`getEmojiSrc(suggestion)`, the image of a search result.

### `EmojiImportExtension`

Adds import rules to `DOMImportExtension` that turn the
`data-emoji-shortcode` element `EmojiNode` exports back into an `EmojiNode`,
and the `data-custom-emoji` element back into a custom emoji.
HTML paste uses it when the editor also has `ClipboardDOMImportExtension`.

### `EmojiNode`

A `TextNode` (type `mn:emoji`) in token mode, so it is deleted as a unit and
the caret moves across it in one step. It is either a Unicode emoji, whose
text is the emoji, or a custom emoji, whose text is `:name:`. Its `$config`
schema adds two properties to the ones it inherits from `TextNode` (`text`,
`format`, `style`, `mode`, `detail`):

| Property | Schema | Default |
| --- | --- | --- |
| `shortcode` | `optional(stringValue())` | absent |
| `name` | `optional(stringValue())` | absent |

`shortcode` is what was typed for a Unicode emoji, such as `:)`. `name` is
set only on a custom emoji; its image is not stored, it comes from
`customEmoji` when the node renders.

Create one with `$createEmojiNode(emoji, shortcode)` or
`$createCustomEmojiNode(name)`, both of which set `mode` to `token`. Test for
one with `$isEmojiNode(node)` (either kind) or `$isCustomEmojiNode(node)`.

The node has no serialization code of its own, as with Lexical's own nodes:
JSON is read and written from the schema, and the compact form
(`editorState.toJSON(true)`) leaves out every property at its default.

### `EmojiTypeaheadExtension`

Suggests emoji while `:name` is typed; see
[Suggestions and pickers](#suggestions-and-pickers).

| Config | Default | Description |
| --- | --- | --- |
| `minLength` | `2` | How much of a name follows the `:` before it opens |
| `limit` | `8` | The most suggestions to show |

Its output has `state` (a signal of the menu, or null), `select(index?)`,
`setSelectedIndex(index)` and `dismiss()`.

### `searchEmoji(query, options?)`

Searches the standard emoji, and `customEmoji` if given, by short name, up
to `limit` (default 8). It needs the emoji database, so importing it puts
the database in your bundle; in an editor, use `EmojiExtension`'s
`searchEmoji` signal, which loads it lazily.

### `INSERT_EMOJI_COMMAND`

Inserts an emoji found by a search at the selection.

### `findEmoji(text)` and `createEmojiMatcher(parser, customEmoji?)`

`findEmoji` returns the first shortcode in a string, its position and its
emoji, or `null`. `createEmojiMatcher` returns the same kind of function for
another `parseEmojiReplacementEntry`, and also matches the `:name:` of a map
of custom emoji (the match then has `custom` set).

### `unifiedIDFromText(emoji)` and `textFromUnifiedID(id)`

Convert between an emoji and its unified id, such as `1f642` for 🙂.
