// @vitest-environment node

import type {LexicalEditor} from 'lexical';

import {afterEach, describe, expect, it, vi} from 'vitest';

type EmojiDatabase = typeof import('../../emojiDatabase.ts');

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

/** Loads the package with a database loader that waits for `load` */
async function importWithLoader(load: Promise<EmojiDatabase>) {
  vi.resetModules();
  // Mock the files rather than the package's `#loadEmojiDatabase` import,
  // whichever of them it resolves to
  const loader = () => ({loadEmojiDatabase: () => load});
  vi.doMock('../../loadEmojiDatabase.ts', loader);
  vi.doMock('../../loadEmojiDatabase.node.ts', loader);
  const [{EmojiExtension}, {buildEditorFromExtensions}, database] =
    await Promise.all([
      import('../../index.ts'),
      import('@lexical/extension'),
      import('../../emojiDatabase.ts'),
    ]);
  return {EmojiExtension, buildEditorFromExtensions, database};
}

afterEach(() => {
  vi.doUnmock('../../loadEmojiDatabase.ts');
  vi.doUnmock('../../loadEmojiDatabase.node.ts');
  vi.doUnmock('../../emojiDatabase.ts');
  vi.resetModules();
});

describe('loading the emoji database asynchronously', () => {
  it('registers the transform once it arrives', async () => {
    const load = deferred<EmojiDatabase>();
    const {EmojiExtension, buildEditorFromExtensions, database} =
      await importWithLoader(load.promise);
    using editor = buildEditorFromExtensions({
      dependencies: [EmojiExtension],
      name: '[root]',
    });
    expect(textTransformCount(editor)).toBe(0);
    load.resolve(database);
    await load.promise;
    expect(textTransformCount(editor)).toBe(1);
  });

  it('splits imported text into emoji only once it arrives', async () => {
    const load = deferred<EmojiDatabase>();
    const {EmojiExtension, buildEditorFromExtensions, database} =
      await importWithLoader(load.promise);
    const [{getExtensionDependencyFromEditor}, {$createTextNode}] =
      await Promise.all([import('@lexical/extension'), import('lexical')]);
    using editor = buildEditorFromExtensions({
      dependencies: [EmojiExtension],
      name: '[root]',
    });
    const {$createEmojiNodesFromText, emojiCategories} =
      getExtensionDependencyFromEditor(editor, EmojiExtension).output;
    const split = () => {
      let texts: string[] = [];
      editor.update(
        () => {
          texts = $createEmojiNodesFromText($createTextNode('a :+1: b')).map(
            node => node.getTextContent(),
          );
        },
        {discrete: true},
      );
      return texts;
    };
    expect(split()).toEqual(['a :+1: b']);
    expect(emojiCategories.value).toBe(null);
    load.resolve(database);
    await load.promise;
    expect(split()).toEqual(['a ', '👍', ' b']);
    expect(emojiCategories.value?.length).toBe(9);
  });

  it('does nothing when the editor is disposed first', async () => {
    const load = deferred<EmojiDatabase>();
    const {EmojiExtension, buildEditorFromExtensions, database} =
      await importWithLoader(load.promise);
    const onError = vi.fn();
    const editor = buildEditorFromExtensions({
      dependencies: [EmojiExtension],
      name: '[root]',
      onError,
    });
    editor.dispose();
    load.resolve(database);
    await load.promise;
    expect(textTransformCount(editor)).toBe(0);
    expect(onError).not.toHaveBeenCalled();
  });

  it("reports a failed load to the editor's onError", async () => {
    const load = deferred<EmojiDatabase>();
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
    const load = deferred<EmojiDatabase>();
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
    vi.doMock('../../emojiDatabase.ts', async importOriginal => {
      if (fail) {
        fail = false;
        throw new Error('chunk failed');
      }
      return importOriginal();
    });
    const {loadEmojiDatabase} = await import('../../loadEmojiDatabase.ts');
    await expect(loadEmojiDatabase()).rejects.toThrow();
    const database = await loadEmojiDatabase();
    expect(typeof database.createTextNodeTransform).toBe('function');
    // Later calls are synchronous
    expect(loadEmojiDatabase()).toBe(database);
  });
});
