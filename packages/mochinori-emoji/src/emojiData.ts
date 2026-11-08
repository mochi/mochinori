import {supportedEmojis} from './supportedEmojis.ts';

/** An emoji of the database */
export interface EmojiData {
  /** The emoji, such as 👍 */
  readonly emoji: string;
  /** Its short names, the main one first, such as `+1` and `thumbsup` */
  readonly shortNames: readonly string[];
  /** Texts that turn into it, such as `:)` */
  readonly texts: readonly string[];
  /** Whether it takes a skin tone, as 👍🏽 does */
  readonly skinTones: boolean;
  /** Its category, such as `Smileys & Emotion` */
  readonly category: string;
  /**
   * The Emoji version that added it, such as 17, when that is 16 or later
   * (older emoji have 0), to leave out of an image set that predates it
   */
  readonly version: number;
}

/**
 * The category of the skin tone modifiers (`:skin-tone-2:` and so on),
 * which pickers and suggestions leave out
 */
export const COMPONENT_CATEGORY = 'Component';

const splitWords = (s: string | undefined) =>
  s ? s.split(' ').filter(Boolean) : [];

let emojiData: EmojiData[] | undefined;

/** Every emoji of the database, in the order pickers show them */
export function getEmojiData(): readonly EmojiData[] {
  if (!emojiData) {
    emojiData = [];
    let category = '';
    for (const line of supportedEmojis.split('\n')) {
      // A category line has no tabs; an emoji line can start with # (#️⃣)
      if (line.startsWith('#') && !line.includes('\t')) {
        category = line.slice(1);
        continue;
      }
      const [emoji, shortNames, texts, skinTones, version] = line.split('\t');
      if (emoji) {
        emojiData.push({
          category,
          emoji,
          shortNames: splitWords(shortNames),
          skinTones: skinTones === 't',
          texts: splitWords(texts),
          version: Number(version ?? 0),
        });
      }
    }
  }
  return emojiData;
}
