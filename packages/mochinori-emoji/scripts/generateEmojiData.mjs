// Writes src/supportedEmojis.ts from the emojibase-data database.
//
// The database is rewritten as plain text, one emoji per line with tab
// separated fields (emoji, short names, texts, whether it takes a skin
// tone, the Emoji version that added it) and space separated values, in
// the order emoji pickers show them, under a `#Category` line for each
// category. That is much smaller than the JSON and quicker to parse.
//
// Short names are Slack's (emojibase's `iamcal` set, the names
// emoji-datasource uses), or emojibase's own for emoji Slack hasn't named.

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

// The names pickers show for emojibase's groups
const CATEGORIES = [
  'Smileys & Emotion',
  'People & Body',
  'Component',
  'Animals & Nature',
  'Food & Drink',
  'Travel & Places',
  'Activities',
  'Objects',
  'Symbols',
  'Flags',
];

const COMPONENT_GROUP = CATEGORIES.indexOf('Component');

// The texts that turn into an emoji, by its first short name. emojibase's
// emoticons include ones like `8)`, `:s` and `:3` that are too easy to type
// by accident, so these are the ones Slack converts.
const TEXTS = {
  angry: ['>:(', '>:-('],
  anguished: ['D:'],
  broken_heart: ['</3'],
  confused: [':\\', ':-\\', ':/', ':-/'],
  disappointed: [':(', '):', ':-('],
  heart: ['<3'],
  kissing_heart: [':*', ':-*'],
  laughing: [':>', ':->'],
  monkey_face: [':o)'],
  neutral_face: [':|', ':-|'],
  open_mouth: [':o', ':-o', ':O', ':-O'],
  slightly_smiling_face: [':)', '(:', ':-)'],
  smile: ['C:', 'c:', ':D', ':-D'],
  smiley: ['=)', '=-)'],
  sob: [":'("],
  stuck_out_tongue: [':p', ':-p', ':P', ':-P', ':b', ':-b'],
  stuck_out_tongue_winking_eye: [';p', ';-p', ';b', ';-b', ';P', ';-P'],
  sunglasses: ['8)'],
  wink: [';)', ';-)'],
};

const asArray = value =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

/**
 * Whether each of the five skin tones of `emoji` is the emoji with the tone
 * modifier after its first code point (dropping a variation selector
 * there). Emoji for two people with a tone each (`people_holding_hands`)
 * aren't, and keep no tone.
 */
function takesSkinTone({emoji, skins}) {
  if (!skins) {
    return false;
  }
  const [first, ...rest] = Array.from(emoji);
  const tail = rest[0] === '\uFE0F' ? rest.slice(1) : rest;
  return [0x1f3fb, 0x1f3fc, 0x1f3fd, 0x1f3fe, 0x1f3ff].every(modifier =>
    skins.some(
      skin =>
        skin.emoji ===
        [first, String.fromCodePoint(modifier), ...tail].join(''),
    ),
  );
}

/** @returns {Promise<string>} the formatted contents of src/supportedEmojis.ts */
export async function generateEmojiData() {
  const {version} = require('emojibase-data/package.json');
  const emojis = require('emojibase-data/en/data.json');
  const slackNames = require('emojibase-data/en/shortcodes/iamcal.json');
  const emojibaseNames = require('emojibase-data/en/shortcodes/emojibase.json');
  const lookUp = (names, hexcode) =>
    asArray(names[hexcode] ?? names[hexcode.replaceAll('-FE0F', '')]);
  const slackNamed = ({hexcode}) => lookUp(slackNames, hexcode).length > 0;
  const namesOf = ({hexcode}) => {
    const slack = lookUp(slackNames, hexcode);
    return slack.length > 0 ? slack : lookUp(emojibaseNames, hexcode);
  };
  const lines = [];
  let category;
  // Regional indicators have no group: they aren't emoji on their own
  for (const emoji of emojis
    .filter(({group}) => group !== undefined)
    .sort((a, b) => a.order - b.order)) {
    const names = namesOf(emoji);
    // Components that Slack doesn't name (the hair styles) aren't emoji of
    // their own either
    if (
      names.length === 0 ||
      (emoji.group === COMPONENT_GROUP && !slackNamed(emoji))
    ) {
      continue;
    }
    if (CATEGORIES[emoji.group] !== category) {
      category = CATEGORIES[emoji.group];
      lines.push(`#${category}`);
    }
    lines.push(
      [
        emoji.emoji,
        names.join(' '),
        (TEXTS[names[0]] ?? []).join(' '),
        takesSkinTone(emoji) ? 't' : '',
        // Only the newer emoji, which an emoji set may not have yet
        emoji.version >= 16 ? String(emoji.version) : '',
      ]
        .join('\t')
        .replace(/\t+$/, ''),
    );
  }
  const supportedEmojis = lines.join('\n');
  const source = [
    `// Generated from emojibase-data@${version} by`,
    '// scripts/generateEmojiData.mjs (`pnpm run generate`). Do not edit.',
    '',
    '/**',
    ' * One emoji per line: the emoji, its short names, its texts (such as',
    ' * `:)`), `t` if it takes a skin tone, and the Emoji version that added',
    ' * it if that is 16 or later, separated by tabs (trailing empty fields',
    ' * left out). Names and texts are separated by spaces. Emoji are in the',
    ' * order pickers show them, after a `#Category` line, which has no tabs,',
    ' * for each category.',
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
