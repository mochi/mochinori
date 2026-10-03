import {
  type EmojiEntryParser,
  parseEmojiShortNamesAndTexts,
} from './emojiEntries.ts';
import {supportedEmojis} from './supportedEmojis.ts';

/**
 * The location of the emoji match in the given text
 */
export type EmojiMatch = Readonly<{
  /** The start position of the text */
  position: number;
  /** The matching shortcode from the text, such as ":man-facepalming:" or ":)" */
  shortcode: string;
  /** The text of the emoji from the database, such as "🤦‍♂️" or "🙂" */
  emoji: string;
}>;

/** Finds the first emoji shortcode in a text, see {@link findEmoji} */
export type EmojiMatcher = (text: string) => EmojiMatch | null;

const splitWords = (s: string | undefined) =>
  s ? s.split(' ').filter(Boolean) : [];

/**
 * Map where keys are possible replacements while values are emoji
 * in text form
 */
function buildEmojiReplacementMap(
  parseEntry: EmojiEntryParser,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of supportedEmojis.split('\n')) {
    const [emoji, shortNames, texts] = line.split('\t');
    if (emoji) {
      for (const [match, replacement] of parseEntry([
        emoji,
        splitWords(shortNames),
        splitWords(texts),
      ])) {
        map.set(match, replacement);
      }
    }
  }
  return map;
}

const EMOJI_DELIMITER = /[ \xa0:]/g;

function findEmojiInMap(
  emojiReplacementMap: ReadonlyMap<string, string>,
  text: string,
): EmojiMatch | null {
  let lastWordBreak = 0;
  let lastColon: number | null = text[0] === ':' ? 0 : null;
  let match: RegExpExecArray | null;
  EMOJI_DELIMITER.lastIndex = 1;
  while ((match = EMOJI_DELIMITER.exec(text))) {
    if (match[0] === ':') {
      if (lastColon !== null) {
        const shortcode = text.slice(lastColon, match.index + 1);
        const emoji = emojiReplacementMap.get(shortcode);
        if (emoji) {
          return {emoji, position: lastColon, shortcode};
        }
      }
      lastColon = match.index;
    } else {
      const shortcode = text.slice(lastWordBreak, match.index);
      if (shortcode) {
        const emoji = emojiReplacementMap.get(shortcode);
        if (emoji) {
          return {emoji, position: lastWordBreak, shortcode};
        }
      }
      lastColon = null;
      lastWordBreak = match.index + 1;
    }
  }
  return null;
}

const matchers = new WeakMap<EmojiEntryParser, EmojiMatcher>();

/**
 * Returns an {@link EmojiMatcher} for the replacements that `parseEntry`
 * returns for each entry of the emoji database. The database is parsed the
 * first time the matcher is called.
 */
export function createEmojiMatcher(parseEntry: EmojiEntryParser): EmojiMatcher {
  let matcher = matchers.get(parseEntry);
  if (!matcher) {
    let map: Map<string, string> | undefined;
    matcher = text => {
      map ??= buildEmojiReplacementMap(parseEntry);
      return findEmojiInMap(map, text);
    };
    matchers.set(parseEntry, matcher);
  }
  return matcher;
}

/**
 * Finds emoji shortcodes in text by scanning for potential start positions. The
 * canonical short names such as ":smiley:" are matched even if they are at
 * the end of the text, but a text such as ":)" is only matched if it is
 * followed by a space or non-letter character.
 *
 * @example Matching canonical short names
 * ```js
 * assert(findEmoji(":man-facepalming:").emoji === "🤦‍♂️");
 * ```
 *
 * @example Matching non-canonical text for an emoji
 * ```js
 * const input = "handles :) mid-string";
 * const result = findEmoji(input);
 * assert(result.position === "handles ".length);
 * assert(result.shortcode === ":)")
 * assert(result.emoji === "🙂");
 * assert([
 *   input.slice(0, result.position),
 *   result.emoji,
 *   input.slice(result.position + result.shortcode.length)
 * ].join("") === "handles 🙂 mid-string");
 * ```
 *
 * @example Non-canonical text does not match at the end
 * ```js
 * assert(findEmoji(":)") === null)
 * ```
 */
export function findEmoji(text: string): EmojiMatch | null {
  return createEmojiMatcher(parseEmojiShortNamesAndTexts)(text);
}
