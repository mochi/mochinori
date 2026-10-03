// Writes src/supportedEmojis.ts from the emoji-datasource-facebook database.
//
// The database is rewritten as plain text, one emoji per line with tab
// separated fields (emoji, short names, texts) and space separated values,
// which is much smaller than the JSON and quicker to parse. Only emoji that
// have a Facebook image are kept.

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

const unique = values => [...new Set(values.filter(Boolean))].join(' ');

/** @returns {Promise<string>} the formatted contents of src/supportedEmojis.ts */
export async function generateEmojiData() {
  const {version} = require('emoji-datasource-facebook/package.json');
  const emojis = require('emoji-datasource-facebook/emoji.json');
  const supportedEmojis = emojis
    .filter(({has_img_facebook}) => has_img_facebook)
    .map(({short_name, short_names, text, texts, unified}) =>
      [
        textFromUnifiedID(unified),
        unique([short_name, ...(short_names ?? [])]),
        unique([text, ...(texts ?? [])]),
      ].join('\t'),
    )
    .join('\n');
  const source = [
    `// Generated from emoji-datasource-facebook@${version} by`,
    '// scripts/generateEmojiData.mjs (`pnpm run generate`). Do not edit.',
    '',
    '/**',
    ' * One emoji per line: the emoji, its short names and its texts (such as',
    ' * `:)`), separated by tabs. Names and texts are separated by spaces.',
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
