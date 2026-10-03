import {createTextNodeTransform} from './$textNodeTransform.ts';

type MaybePromise<T> = T | Promise<T>;

/**
 * Returns the text transform synchronously, so a headless or server-rendered
 * editor converts shortcodes from its first update
 */
export function loadTextNodeTransform(): MaybePromise<
  typeof createTextNodeTransform
> {
  return createTextNodeTransform;
}
