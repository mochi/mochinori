import type {createTextNodeTransform} from './$textNodeTransform.ts';

type MaybePromise<T> = T | Promise<T>;

let cache: MaybePromise<typeof createTextNodeTransform> | undefined;

/**
 * Loads the text transform, and with it the emoji database, as a separate
 * chunk the first time an editor needs it. Node and other non-browser
 * runtimes load `loadTextNodeTransform.node.ts` instead, which returns it
 * synchronously.
 */
export function loadTextNodeTransform(): MaybePromise<
  typeof createTextNodeTransform
> {
  if (!cache) {
    cache = import('./$textNodeTransform.ts').then(
      mod => {
        cache = mod.createTextNodeTransform;
        return cache;
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
