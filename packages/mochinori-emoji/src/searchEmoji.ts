import type {CustomEmoji} from './customEmoji.ts';

import {supportedEmojis} from './supportedEmojis.ts';

/**
 * An emoji found by {@link searchEmoji}: a Unicode emoji (`emoji`) or a
 * custom one (`custom`), with the short name that matched
 */
export interface EmojiSuggestion {
  /** The short name that matched, typed as `:name:` */
  readonly name: string;
  /** The Unicode emoji, such as 🍎 */
  readonly emoji?: string;
  /** The custom emoji */
  readonly custom?: CustomEmoji;
}

export interface SearchEmojiOptions {
  /** Custom emoji to search as well */
  readonly customEmoji?: Iterable<CustomEmoji>;
  /** The most results to return. Default: 8 */
  readonly limit?: number;
}

/**
 * Searches emoji by short name, the way chat apps suggest them as `:app` is
 * typed: names that are the query, then ones that start with it, then ones
 * with a word that starts with it (`green_apple`), then ones that contain
 * it (`pineapple`). Within each, custom emoji come first (an app's own
 * emoji are the ones its people added on purpose), then shorter names. Each emoji
 * appears once, under its best matching name. Matching ignores case. An
 * empty query matches every emoji, in the database's order.
 */
export function searchEmoji(
  query: string,
  options: SearchEmojiOptions = {},
): EmojiSuggestion[] {
  const {customEmoji = [], limit = 8} = options;
  const q = query.toLowerCase();
  const best = new Map<string, {rank: number; suggestion: EmojiSuggestion}>();
  const consider = (key: string, name: string, make: () => EmojiSuggestion) => {
    const rank = rankName(name.toLowerCase(), q);
    if (rank === null) {
      return;
    }
    const prev = best.get(key);
    if (
      !prev ||
      rank < prev.rank ||
      (rank === prev.rank && name.length < prev.suggestion.name.length)
    ) {
      best.set(key, {rank, suggestion: make()});
    }
  };
  for (const [emoji, name] of getShortNames()) {
    consider(emoji, name, () => ({emoji, name}));
  }
  for (const custom of customEmoji) {
    consider(`:${custom.name}`, custom.name, () => ({
      custom,
      name: custom.name,
    }));
  }
  // Map keeps insertion order, so a stable sort keeps the database order
  // between names that rank the same
  return Array.from(best.values())
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        Number(!a.suggestion.custom) - Number(!b.suggestion.custom) ||
        a.suggestion.name.length - b.suggestion.name.length,
    )
    .slice(0, limit)
    .map(({suggestion}) => suggestion);
}

/** Lower is better, null for no match */
function rankName(name: string, q: string): number | null {
  if (q === '') {
    return 0;
  }
  if (name === q) {
    return 0;
  }
  if (name.startsWith(q)) {
    return 1;
  }
  const index = name.indexOf(q);
  if (index === -1) {
    return null;
  }
  // A word of the name starts with it, as in green_apple
  for (let i = index; i !== -1; i = name.indexOf(q, i + 1)) {
    if (/[_\-+]/.test(name[i - 1] ?? '')) {
      return 2;
    }
  }
  return 3;
}

let shortNames: [emoji: string, name: string][] | undefined;

/** Every short name of every emoji, in the database's order */
function getShortNames(): [emoji: string, name: string][] {
  if (!shortNames) {
    shortNames = [];
    for (const line of supportedEmojis.split('\n')) {
      const [emoji, names] = line.split('\t');
      if (emoji && names) {
        for (const name of names.split(' ')) {
          if (name) {
            shortNames.push([emoji, name]);
          }
        }
      }
    }
  }
  return shortNames;
}
