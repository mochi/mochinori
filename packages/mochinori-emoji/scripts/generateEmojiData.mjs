// Writes src/supportedEmojis.ts from the emoji-datasource-facebook database.
//
// The database is rewritten as plain text, one emoji per line with tab
// separated fields (emoji, short names, texts, whether it takes a skin
// tone) and space separated values, in the order emoji pickers show them,
// under a `#Category` line for each category. That is much smaller than the
// JSON and quicker to parse. Only emoji that have a Facebook image are kept.

import fs from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as prettier from 'prettier';

const require = createRequire(import.meta.url);

export const OUTPUT_FILE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src/supportedEmojis.ts',
);

function textFromUnifiedID(unifiedID) {
  return String.fromCodePoint(
    ...unifiedID.split('-').map(v => parseInt(v, 16)),
  );
}

const SKIN_TONES = ['1F3FB', '1F3FC', '1F3FD', '1F3FE', '1F3FF'];

/**
 * Whether each of the five skin tones of `emoji` is the emoji with the tone
 * modifier after its first code point (dropping a variation selector
 * there), which is how the database's own code computes them. Emoji for two
 * people with a tone each (`people_holding_hands`) don't, and keep no tone.
 */
function takesSkinTone({has_img_facebook, skin_variations, unified}) {
  if (!has_img_facebook || !skin_variations) {
    return false;
  }
  const [first, ...rest] = unified.split('-');
  const tail = rest[0] === 'FE0F' ? rest.slice(1) : rest;
  return SKIN_TONES.every(tone => {
    const variation = skin_variations[tone];
    return (
      variation?.has_img_facebook &&
      variation.unified === [first, tone, ...tail].join('-')
    );
  });
}

const unique = values => [...new Set(values.filter(Boolean))].join(' ');

/** @returns {Promise<string>} the formatted contents of src/supportedEmojis.ts */
export async function generateEmojiData() {
  const {version} = require('emoji-datasource-facebook/package.json');
  const emojis = require('emoji-datasource-facebook/emoji.json');
  // A text such as `:)` that several emoji list goes to the last of them in
  // the database's own order (by unified id), as it did when the lines were
  // in that order
  const textOwner = new Map();
  for (const emoji of [...emojis].sort((a, b) =>
    a.unified < b.unified ? -1 : 1,
  )) {
    if (emoji.has_img_facebook) {
      for (const text of [emoji.text, ...(emoji.texts ?? [])]) {
        if (text) {
          textOwner.set(text, emoji.unified);
        }
      }
    }
  }
  const lines = [];
  let category;
  for (const emoji of emojis
    .filter(({has_img_facebook}) => has_img_facebook)
    .sort((a, b) => a.sort_order - b.sort_order)) {
    if (emoji.category !== category) {
      category = emoji.category;
      lines.push(`#${category}`);
    }
    lines.push(
      [
        textFromUnifiedID(emoji.unified),
        unique([emoji.short_name, ...(emoji.short_names ?? [])]),
        unique(
          [emoji.text, ...(emoji.texts ?? [])].filter(
            text => textOwner.get(text) === emoji.unified,
          ),
        ),
        takesSkinTone(emoji) ? 't' : '',
      ].join('\t'),
    );
  }
  const supportedEmojis = lines.join('\n');
  const source = [
    `// Generated from emoji-datasource-facebook@${version} by`,
    '// scripts/generateEmojiData.mjs (`pnpm run generate`). Do not edit.',
    '',
    '/**',
    ' * One emoji per line: the emoji, its short names, its texts (such as',
    ' * `:)`) and `t` if it takes a skin tone, separated by tabs. Names and',
    ' * texts are separated by spaces. Emoji are in the order pickers show',
    ' * them, after a `#Category` line for each category.',
    ' */',
    `export const supportedEmojis = ${JSON.stringify(supportedEmojis)};`,
    '',
  ].join('\n');
  const options = await prettier.resolveConfig(OUTPUT_FILE);
  return prettier.format(source, {...options, filepath: OUTPUT_FILE});
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(OUTPUT_FILE, await generateEmojiData());
}
