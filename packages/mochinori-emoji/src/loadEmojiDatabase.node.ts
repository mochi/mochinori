import * as emojiDatabase from './emojiDatabase.ts';

type EmojiDatabase = typeof import('./emojiDatabase.ts');
type MaybePromise<T> = T | Promise<T>;

/**
 * Returns the code that needs the emoji database synchronously, so a
 * headless or server-rendered editor converts shortcodes from its first
 * update
 */
export function loadEmojiDatabase(): MaybePromise<EmojiDatabase> {
  return emojiDatabase;
}
