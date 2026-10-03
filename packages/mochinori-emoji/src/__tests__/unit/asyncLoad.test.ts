// @vitest-environment node

import type {LexicalEditor} from 'lexical';

import {afterEach, describe, expect, it, vi} from 'vitest';

type CreateTransform =
  typeof import('../../$textNodeTransform.ts').createTextNodeTransform;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, reject, resolve};
}

function textTransformCount(editor: LexicalEditor): number {
  return editor._nodes.get('text')?.transforms.size ?? 0;
}

/** Loads the package with a transform loader that waits for `load` */
async function importWithLoader(load: Promise<CreateTransform>) {
  vi.resetModules();
  // Mock the files rather than the package's `#loadTextNodeTransform`
  // import, whichever of them it resolves to
  const loader = () => ({loadTextNodeTransform: () => load});
  vi.doMock('../../loadTextNodeTransform.ts', loader);
  vi.doMock('../../loadTextNodeTransform.node.ts', loader);
  const [{EmojiExtension}, {buildEditorFromExtensions}, transform] =
    await Promise.all([
      import('../../index.ts'),
      import('@lexical/extension'),
      import('../../$textNodeTransform.ts'),
    ]);
  return {
    EmojiExtension,
    buildEditorFromExtensions,
    createTextNodeTransform: transform.createTextNodeTransform,
  };
}

afterEach(() => {
  vi.doUnmock('../../loadTextNodeTransform.ts');
  vi.doUnmock('../../loadTextNodeTransform.node.ts');
  vi.doUnmock('../../$textNodeTransform.ts');
  vi.resetModules();
});

describe('loading the transform asynchronously', () => {
  it('registers the transform once it arrives', async () => {
    const load = deferred<CreateTransform>();
    const {EmojiExtension, buildEditorFromExtensions, createTextNodeTransform} =
      await importWithLoader(load.promise);
    using editor = buildEditorFromExtensions({
      dependencies: [EmojiExtension],
      name: '[root]',
    });
    expect(textTransformCount(editor)).toBe(0);
    load.resolve(createTextNodeTransform);
    await load.promise;
    expect(textTransformCount(editor)).toBe(1);
  });

  it('does nothing when the editor is disposed first', async () => {
    const load = deferred<CreateTransform>();
    const {EmojiExtension, buildEditorFromExtensions, createTextNodeTransform} =
      await importWithLoader(load.promise);
    const onError = vi.fn();
    const editor = buildEditorFromExtensions({
      dependencies: [EmojiExtension],
      name: '[root]',
      onError,
    });
    editor.dispose();
    load.resolve(createTextNodeTransform);
    await load.promise;
    expect(textTransformCount(editor)).toBe(0);
    expect(onError).not.toHaveBeenCalled();
  });

  it("reports a failed load to the editor's onError", async () => {
    const load = deferred<CreateTransform>();
    const {EmojiExtension, buildEditorFromExtensions} = await importWithLoader(
      load.promise,
    );
    const onError = vi.fn();
    using editor = buildEditorFromExtensions({
      dependencies: [EmojiExtension],
      name: '[root]',
      onError,
    });
    const error = new Error('chunk failed');
    load.reject(error);
    await load.promise.catch(() => {});
    expect(onError).toHaveBeenCalledWith(error, editor);
    expect(textTransformCount(editor)).toBe(0);
  });

  it('stays quiet about a failed load after dispose', async () => {
    const load = deferred<CreateTransform>();
    const {EmojiExtension, buildEditorFromExtensions} = await importWithLoader(
      load.promise,
    );
    const onError = vi.fn();
    const editor = buildEditorFromExtensions({
      dependencies: [EmojiExtension],
      name: '[root]',
      onError,
    });
    editor.dispose();
    load.reject(new Error('chunk failed'));
    await load.promise.catch(() => {});
    expect(onError).not.toHaveBeenCalled();
  });
});

describe('the lazy loader', () => {
  it('tries again after a failed load', async () => {
    vi.resetModules();
    let fail = true;
    vi.doMock('../../$textNodeTransform.ts', async importOriginal => {
      if (fail) {
        fail = false;
        throw new Error('chunk failed');
      }
      return importOriginal();
    });
    const {loadTextNodeTransform} =
      await import('../../loadTextNodeTransform.ts');
    await expect(loadTextNodeTransform()).rejects.toThrow();
    const createTextNodeTransform = await loadTextNodeTransform();
    expect(typeof createTextNodeTransform).toBe('function');
    // Later calls are synchronous
    expect(loadTextNodeTransform()).toBe(createTextNodeTransform);
  });
});
