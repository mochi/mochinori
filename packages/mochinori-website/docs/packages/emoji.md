---
title: '@mochinori/emoji'
---

# `@mochinori/emoji`

Emoji for Lexical. Typing a short name such as `:tada:` or
`:man-facepalming:`, or a smiley such as `:)` followed by a space, replaces it
with an `EmojiNode`, and so does a Unicode emoji typed with the system's
emoji picker or pasted. It knows every emoji up to Emoji 18, with Slack's
short names, from [emojibase](https://emojibase.dev). Emoji are drawn with
Twemoji images or Google's Noto Color Emoji font, so they look the same on
every platform. Apps can add custom emoji beyond Unicode,
like a Slack workspace or a Discord server, and change them while the editor
runs.

[Try it in the demos](/demos#emoji).

## Usage

```ts
import {EmojiExtension} from '@mochinori/emoji';
import {defineExtension} from 'lexical';

const AppExtension = defineExtension({
  dependencies: [EmojiExtension],
  name: '@my-app/Editor',
});
```

Each emoji is drawn as a 1.25em image sitting on the baseline, like a
glyph, at any font and size, with a 0.075em margin on each side so emoji
side by side don't touch; those styles are inline. Until its image loads
the font's emoji shows, so hide it once the image has loaded, keeping the
caret visible:

```css
.mochinori-emoji {
  caret-color: CanvasText;
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
  so other apps show the image, and an editor with `EmojiExtension` imports
  it back by name.

The image's size, margin and position are inline styles (1.25em square). The
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
before), and `getEmojiSrc(suggestion)` gives each one's image. It is `''`
for an emoji that has no image (with the `google` set, or one newer than
Twemoji), which the picker draws as text in the `emojiFontFamily` output's
font. Insert the emoji the person picks with
`INSERT_EMOJI_COMMAND`:

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

For a picker's tabs, the `emojiCategories` output signal holds the emoji by
category (`Smileys & Emotion`, `People & Body` and so on), in the order
pickers show them, once the database has loaded:

```ts
const {emojiCategories} = getExtensionDependencyFromEditor(
  editor,
  EmojiExtension,
).output;
for (const {name, emoji} of emojiCategories.value ?? []) {
  // A heading for `name`, then a button for each of `emoji`
}
```

## Skin tones

Emoji such as 👍 take a skin tone, as in Slack and Discord:

- Typing `:+1::skin-tone-3:` gives 👍🏼, and its shortcode is kept whole.
  A `:skin-tone-N:` typed right after an emoji that takes one changes that
  emoji's tone; after any other, it stays the modifier on its own.
- The `skinTone` output signal (config `skinTone`, from 1, no tone, to 6)
  is the person's choice: short names typed after it is set, suggestions,
  `searchEmoji` and `emojiCategories` use it. Set it from the picker's
  skin tone menu. Emoji already in the document keep their tone, and
  texts such as `:)` never take one.
- `SKIN_TONES` lists the six, for that menu.

Emoji for two people with a tone each, such as 🧑🏻‍🤝‍🧑🏿, take no tone.

## Markdown

`EmojiMdastExtension`, from `@mochinori/emoji/mdast`, adds emoji to
[`@lexical/mdast`](https://lexical.dev/docs/api/modules/lexical_mdast)
Markdown. Install `@lexical/mdast` too; it is an optional peer dependency,
needed only for this entry.

```ts
import {MdastExtension} from '@lexical/mdast';
import {EmojiMdastExtension} from '@mochinori/emoji/mdast';

const AppExtension = defineExtension({
  dependencies: [EmojiExtension, MdastExtension, EmojiMdastExtension],
  name: '@my-app/Editor',
});
```

- Export writes a Unicode emoji as itself (👍🏼), which any Markdown reader
  shows, as Discord and GitHub store them, and a custom emoji as its
  `:name:`. Formatting around emoji is kept (`**🍎**`).
- Import turns Unicode emoji, shortcodes (`:+1:`, `:+1::skin-tone-3:`, `:)`)
  and custom emoji names back into emoji, so a document round-trips.
  Names that aren't emoji, code, and symbols drawn as text by default
  (such as © or ☺ without its variation selector) stay text. Imported
  short names don't take the person's skin tone.
- Import needs the emoji database. In a browser it loads when the editor
  is created; Markdown imported before then keeps its emoji as text, and
  they convert later, while the editor is editable. Wait for
  `searchEmoji` to be set before importing if that matters.

How standard emoji export is an option of `EmojiMdastExtension`:

| Config | Default | Description |
| --- | --- | --- |
| `exportFormat` | `'unicode'` | `'shortcode'` writes standard emoji by short name instead (`:+1::skin-tone-3:`, and `:slightly_smiling_face:` for one typed as `:)`), as Slack stores them. Custom emoji always export as `:name:` |

```ts
configExtension(EmojiMdastExtension, {exportFormat: 'shortcode'});
```

Whether Unicode emoji become emoji, whether typed, pasted or imported, is
`EmojiExtension`'s `convertUnicodeEmoji`. With it off, Unicode emoji stay
text in the font, while shortcodes still become images.

The rules are `EmojiMdastImportRule`, a `text` rule built on
`EmojiExtension`'s `$createEmojiNodesFromText(node, options?)`, which an app
can also use to split text it imports some other way, and
`EmojiMdastExportRule`. Both read `EmojiMdastExtension`'s config, so use
them through it.

## Emoji images

`emojiSet` picks how emoji are drawn:

| `emojiSet` | Drawn with | License |
| --- | --- | --- |
| `'twitter'` (default) | [Twemoji](https://github.com/jdecked/twemoji) 72×72 images (`TWEMOJI_VERSION`, Emoji 17) on jsDelivr, as Discord shows them | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/): credit it, such as "Emoji graphics by Twemoji, CC BY 4.0". Twemoji accepts a mention in your README, an About screen, or the page source |
| `'google'` | The [Noto Color Emoji](https://fonts.google.com/noto/specimen/Noto+Color+Emoji) font from Google Fonts, which Google updates for each Unicode release | [SIL Open Font License](https://openfontlicense.org) |

```ts
configExtension(EmojiExtension, {emojiSet: 'google'});
```

Twemoji has an image for every emoji up to Emoji 17 (`TWEMOJI_EMOJI_VERSION`),
in every skin tone. The few newer ones are drawn with the Noto font until
Twemoji draws them.

To draw with Noto, the extension adds the Google Fonts stylesheet
(`NOTO_COLOR_EMOJI_STYLESHEET`) to the editor's document. Google Fonts splits
the font by Unicode range, so a page downloads only the parts with the emoji
it shows, and a page with Twemoji loads none of it until it shows an emoji
newer than Twemoji. To load the font yourself, such as from
`@fontsource/noto-color-emoji`, set `emojiFontStylesheet` to `''`; to use
another font, set `emojiFontFamily`.

### Content Security Policy

The extension sets its styles through `element.style`, which a CSP's
`style-src` doesn't restrict, and needs no inline scripts. What a policy has
to allow depends on where the emoji come from:

| Emoji from | Directives |
| --- | --- |
| Twemoji on jsDelivr (default) | `img-src https://cdn.jsdelivr.net` |
| Noto from Google Fonts | `style-src https://fonts.googleapis.com` and `font-src https://fonts.gstatic.com` |
| Custom emoji | `img-src` for wherever their images are |

A policy that allows stylesheets only by nonce or hash blocks the stylesheet
the extension adds. Set `emojiFontStylesheet: ''` and load the font
yourself: a `<link>` with your nonce, or `@fontsource/noto-color-emoji`
bundled with your app's CSS. Serving Twemoji yourself (`emojiBaseUrl`) and
bundling the font keeps everything on `'self'`.

The `emojiSet` output signal switches sets while the editor runs: the emoji
in the document are redrawn in place, each keeping its current image until
the new one loads.

Apple's images aren't licensed for commercial use, and Facebook's have no
clear license and stop at Unicode 15, so neither is offered. To serve
Twemoji yourself, copy `assets/72x72` from jdecked/twemoji at
`TWEMOJI_VERSION` and set `emojiBaseUrl` to where it is.

## How it loads

The emoji database (about 70 KB, 19 KB compressed) is loaded with a dynamic `import()`, so
bundlers put it in its own chunk, and it is only fetched when an editor with
`EmojiExtension` is created. Node and other non-browser runtimes load it
synchronously, so a headless editor converts shortcodes from its first update.
Text typed before the database arrives is converted when it does. If it
fails to load (for example, offline), the error goes to the editor's
`onError` and the next editor tries again; an editor disposed before it
arrives is left alone.

Each emoji's image is loaded with the page's own document. Until it loads,
the font's emoji is shown.

Shortcodes and Unicode emoji are only converted while the editor is
editable. When a read-only editor becomes editable, any in it are
converted.

## API

### `EmojiExtension`

Registers `EmojiNode`, converts shortcodes, and loads each emoji's image.

| Config | Default | Description |
| --- | --- | --- |
| `emojiSet` | `'twitter'` | What to draw emoji with: `'twitter'` (Twemoji images) or `'google'` (the Noto Color Emoji font); see [Emoji images](#emoji-images) |
| `emojiBaseUrl` | `''` | Where your own copy of Twemoji's images is, without a trailing slash: `assets/72x72` from jdecked/twemoji at `TWEMOJI_VERSION`, named by `twemojiID`. It replaces `emojiSet`. Empty uses the `emojiSet` (`emojiSetBaseUrl(set)`) |
| `emojiFontFamily` | `'"Noto Color Emoji"'` | The CSS `font-family` of emoji that have no image (all of them with `'google'`); `''` for the platform's font |
| `emojiFontStylesheet` | `NOTO_COLOR_EMOJI_STYLESHEET` | The stylesheet that loads `emojiFontFamily`, added to the editor's document when it is used; `''` to load the font yourself |
| `emojiClass` | `'mochinori-emoji'` | Class of every emoji |
| `emojiLoadingClass` | `''` | Added until the image loads |
| `emojiLoadedClass` | `'mochinori-emoji--loaded'` | Added once the image loads |
| `customEmoji` | `[]` | Custom emoji (`{name, src}`), the initial value of the `customEmoji` output signal |
| `loadCustomEmoji` | `undefined` | `(abortSignal) => Promise<CustomEmoji[]>`, called when an editor is created; the result is added to `customEmoji`. The signal aborts on dispose, and a rejection goes to the editor's `onError` |
| `lookupCustomEmoji` | `undefined` | `(query, abortSignal) => Promise<CustomEmoji[]>`, asked for the start of a typed name and for unknown names in the document; the result is added to `customEmoji`. The signal aborts on dispose, and a rejection goes to the editor's `onError` |
| `customEmojiLookupMinLength` | `2` | How much of a name is typed after the `:` before `lookupCustomEmoji` is asked |
| `customEmojiClass` | `'mochinori-custom-emoji'` | Class of every custom emoji |
| `parseEmojiReplacementEntry` | `parseEmojiShortNamesAndTexts` | Which texts to replace: `parseEmojiShortNames` (only `:short_name:`), `parseEmojiTexts` (only smileys like `:)`), or your own function |
| `skinTone` | `1` | The skin tone (1 to 6) of typed short names, suggestions and searches, the initial value of the `skinTone` output signal |
| `convertUnicodeEmoji` | `true` | Whether Unicode emoji typed, pasted or imported from Markdown become emoji drawn with the images, as in Slack and Discord, rather than staying text in the font. Only emoji in the database convert. The initial value of the `convertUnicodeEmoji` output signal |

Its output has:

| Output | Description |
| --- | --- |
| `customEmoji` | A signal of the custom emoji, to set while the editor runs |
| `customEmojiByName` | The same, as a `Map` |
| `searchEmoji` | A signal of a search over the standard and custom emoji, null until the database loads |
| `emojiCategories` | A signal of the emoji by category, null until the database loads |
| `skinTone` | A signal of the skin tone to use |
| `emojiSet` | A signal of the emoji set to draw with; setting it redraws the emoji in place |
| `emojiBaseUrl` | A signal of where the current set's images are, `''` for a font, which `getEmojiSrc` reads |
| `emojiFontFamily` | The `emojiFontFamily` config, to draw emoji that have no image |
| `convertUnicodeEmoji` | A signal of whether Unicode emoji convert; turning it on converts those already in the document |
| `getEmojiSrc(suggestion)` | The image of a search result, `''` for one to draw as text in `emojiFontFamily` |
| `getEmojiShortcode(emoji)` | The short name of a Unicode emoji, such as `:+1::skin-tone-3:`, or null |
| `$createEmojiNodesFromText(node, options?)` | Splits a text node that isn't in the document yet into text and emoji nodes; `options` (`{shortcodes, unicode}`) can leave out either kind |

It also adds `EmojiImportRules` to `DOMImportExtension`, which turn the
`data-emoji-shortcode` element `EmojiNode` exports back into an `EmojiNode`,
and the `data-custom-emoji` element back into a custom emoji. HTML paste
uses them when the editor also has `ClipboardDOMImportExtension`, and so
does `$generateNodesFromDOM` from `DOMImportExtension`'s output.

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
to `limit` (default 8), giving those that take one the `skinTone` if given
(the result then has `skinTone` set). It needs the emoji database, so importing it puts
the database in your bundle; in an editor, use `EmojiExtension`'s
`searchEmoji` signal, which loads it lazily.

### `getEmojiCategories(options?)`

The emoji by category, with `skinTone` applied if given. Like
`searchEmoji`, importing it puts the database in your bundle; in an editor,
use the `emojiCategories` signal.

### `EmojiMdastExtension`, `EmojiMdastImportRule` and `EmojiMdastExportRule`

From `@mochinori/emoji/mdast`; see [Markdown](#markdown).

### `INSERT_EMOJI_COMMAND`

Inserts an emoji found by a search at the selection.

### `findEmoji(text)` and `createEmojiMatcher(parser, customEmoji?)`

`findEmoji` returns the first shortcode in a string, its position and its
emoji, or `null`. `createEmojiMatcher` returns the same kind of function for
another `parseEmojiReplacementEntry`, and also matches the `:name:` of a map
of custom emoji (the match then has `custom` set).

### `twemojiID(emoji)`

The name of an emoji's Twemoji image, without `.png`, as Twemoji spells it,
such as `1f642` for 🙂, `2764` for ❤️ and `23-20e3` for #️⃣. Use it to
draw an emoji with your own copy of the images.
