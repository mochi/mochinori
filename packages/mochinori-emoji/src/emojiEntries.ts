/**
 * An entry of the emoji database: the emoji, its short names (such as
 * `man-facepalming`) and its texts (such as `:)`).
 */
export type EmojiEntry = [
  emoji: string,
  shortNames: readonly string[],
  texts: readonly string[],
];

/** Text to replace, and the emoji to replace it with */
export type MatchEmojiPair = readonly [match: string, emoji: string];

/**
 * Turns an entry of the emoji database into the texts that should be
 * replaced by its emoji
 */
export type EmojiEntryParser = (entry: EmojiEntry) => readonly MatchEmojiPair[];

/** Replaces short names such as `:man-facepalming:` */
export const parseEmojiShortNames: EmojiEntryParser = ([emoji, shortNames]) =>
  shortNames.map(shortName => [`:${shortName}:`, emoji]);

/** Replaces texts such as `:)` */
export const parseEmojiTexts: EmojiEntryParser = ([emoji, , texts]) =>
  texts.map(text => [text, emoji]);

/** Replaces both short names and texts (the default) */
export const parseEmojiShortNamesAndTexts: EmojiEntryParser = entry => [
  ...parseEmojiShortNames(entry),
  ...parseEmojiTexts(entry),
];
