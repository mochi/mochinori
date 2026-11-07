# `@mochinori/emoji`

Emoji for [Lexical](https://lexical.dev) editors. Typing a short name such as
`:tada:`, a smiley such as `:)`, or a Unicode emoji such as 👍, replaces it
with an `EmojiNode` drawn with Twemoji or Noto images from
[emoji-data](https://github.com/iamcal/emoji-data), so emoji look the same on
every platform. Custom emoji, like a Slack workspace's,
extend the set with your own images and can change while the editor runs.
Emoji take skin tones (`:+1::skin-tone-3:`), a headless typeahead and the
emoji's categories help apps build Slack- and Discord-style pickers, and
`@mochinori/emoji/mdast` adds them to `@lexical/mdast` Markdown, as Unicode or
as shortcodes. The emoji database loads lazily in its own chunk.

## Install

```sh
npm install @mochinori/emoji lexical @lexical/extension @lexical/html
```

`lexical` and `@lexical/*` are peer dependencies: your app provides exactly one
copy of Lexical.

## Usage

```ts
import {EmojiExtension} from '@mochinori/emoji';
import {defineExtension} from 'lexical';

const AppExtension = defineExtension({
  dependencies: [EmojiExtension],
  name: '@my-app/Editor',
});
```

Each emoji's image size and position are inline styles. Hide the font's
emoji once the image loads, keeping the caret visible:

```css
.mochinori-emoji {
  caret-color: CanvasText;
}
.mochinori-emoji--loaded {
  color: transparent;
}
```

See the [docs](https://github.com/mochi/mochinori/blob/main/packages/mochinori-website/docs/packages/emoji.md).

## Emoji images

The default images are [Twemoji](https://github.com/jdecked/twemoji), under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), so an app that
shows them credits them, such as "Emoji graphics by Twemoji, CC BY 4.0".
Twemoji accepts a mention in the app's README, an About screen, or the page
source. Set
`emojiSet: 'google'` for [Noto Color Emoji](https://github.com/googlefonts/noto-emoji)
(Apache 2.0) instead.
