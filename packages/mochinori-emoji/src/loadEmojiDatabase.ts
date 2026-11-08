type EmojiDatabase = typeof import('./emojiDatabase.ts');
type MaybePromise<T> = T | Promise<T>;

let cache: MaybePromise<EmojiDatabase> | undefined;

/**
 * Loads the code that needs the emoji database (the text transform and
 * search), and with it the database, as a separate chunk the first time an
 * editor needs it. Node and other non-browser runtimes load
 * `loadEmojiDatabase.node.ts` instead, which returns it synchronously.
 */
export function loadEmojiDatabase(): MaybePromise<EmojiDatabase> {
  if (!cache) {
    cache = import('./emojiDatabase.ts').then(
      mod => {
        cache = mod;
        return mod;
      },
      (error: unknown) => {
        // A chunk that failed to load (say, offline) is tried again by the
        // next editor instead of failing for the rest of the page's life
        cache = undefined;
        throw error;
      },
    );
  }
  return cache;
}
