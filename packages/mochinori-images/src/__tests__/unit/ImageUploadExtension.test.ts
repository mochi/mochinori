import {
  buildEditorFromExtensions,
  getExtensionDependencyFromEditor,
} from '@lexical/extension';
import {HistoryExtension} from '@lexical/history';
import {DRAG_DROP_PASTE, RichTextExtension} from '@lexical/rich-text';
import {
  $createParagraphNode,
  $getRoot,
  $insertNodes,
  $isElementNode,
  configExtension,
  defineExtension,
  UNDO_COMMAND,
} from 'lexical';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {
  $createImageNode,
  $isImageNode,
  type ImageNode,
  type ImageUploadConfig,
  type ImageUploader,
  ImageUploadExtension,
} from '../../index.ts';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, reject, resolve};
}

/** An uploader whose calls each wait for the test to settle them */
function manualUploader() {
  const calls: {file: Blob; result: Deferred<{src: string}>}[] = [];
  const upload: ImageUploader = file => {
    const result = deferred<{src: string}>();
    calls.push({file, result});
    return result.promise;
  };
  return {calls, upload};
}

function buildEditor(config: Partial<ImageUploadConfig>) {
  const editor = buildEditorFromExtensions(
    defineExtension({
      $initialEditorState: () => {
        const paragraph = $createParagraphNode();
        $getRoot().append(paragraph);
        paragraph.select();
      },
      dependencies: [
        RichTextExtension,
        HistoryExtension,
        configExtension(ImageUploadExtension, config),
      ],
      name: '[root]',
    }),
  );
  const root = document.createElement('div');
  root.contentEditable = 'true';
  document.body.append(root);
  editor.setRootElement(root);
  return editor;
}

function $getImages(): ImageNode[] {
  return $getRoot()
    .getChildren()
    .flatMap(child =>
      $isElementNode(child) ? child.getChildren().filter($isImageNode) : [],
    );
}

const png = () =>
  new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'mochi.png', {
    type: 'image/png',
  });

// Settles the upload's promise chain and the swap update
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

let objectUrls = 0;
beforeEach(() => {
  objectUrls = 0;
  // jsdom does not implement object URLs
  URL.createObjectURL = vi.fn(() => `blob:test/${++objectUrls}`);
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  document.body.textContent = '';
});

describe('ImageUploadExtension', () => {
  it('previews a pasted file locally, then swaps to the uploaded URL', async () => {
    const {calls, upload} = manualUploader();
    using editor = buildEditor({upload});
    const {uploads} = getExtensionDependencyFromEditor(
      editor,
      ImageUploadExtension,
    ).output;

    const file = png();
    editor.update(() => editor.dispatchCommand(DRAG_DROP_PASTE, [file]), {
      discrete: true,
    });
    await flush();
    editor.read(() => {
      expect($getImages().map(image => image.getSrc())).toEqual([
        'blob:test/1',
      ]);
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].file).toBe(file);
    expect(uploads.value.get('blob:test/1')).toEqual({
      progress: null,
      status: 'uploading',
    });

    calls[0].result.resolve({src: 'https://example.com/mochi.png'});
    await flush();
    editor.read(() => {
      expect($getImages().map(image => image.getSrc())).toEqual([
        'https://example.com/mochi.png',
      ]);
    });
    expect(uploads.value.get('blob:test/1')).toEqual({
      src: 'https://example.com/mochi.png',
      status: 'uploaded',
    });
  });

  it('merges the swap into the insertion, so one undo removes the image', async () => {
    const {calls, upload} = manualUploader();
    using editor = buildEditor({upload});
    editor.update(() => editor.dispatchCommand(DRAG_DROP_PASTE, [png()]), {
      discrete: true,
    });
    await flush();
    calls[0].result.resolve({src: 'https://example.com/mochi.png'});
    await flush();
    editor.update(() => editor.dispatchCommand(UNDO_COMMAND, undefined), {
      discrete: true,
    });
    editor.read(() => {
      expect($getImages()).toHaveLength(0);
    });
  });

  it('swaps images that undo brings back with their local URL', async () => {
    const {calls, upload} = manualUploader();
    using editor = buildEditor({upload});
    editor.update(() => editor.dispatchCommand(DRAG_DROP_PASTE, [png()]), {
      discrete: true,
    });
    await flush();
    // A later edit while the upload runs records the local URL in history
    editor.update(() => $getImages()[0].setAltText('mochi'), {discrete: true});
    calls[0].result.resolve({src: 'https://example.com/mochi.png'});
    await flush();
    editor.update(() => editor.dispatchCommand(UNDO_COMMAND, undefined), {
      discrete: true,
    });
    await flush();
    editor.read(() => {
      const [image] = $getImages();
      expect(image.getAltText()).toBe('');
      expect(image.getSrc()).toBe('https://example.com/mochi.png');
    });
    expect(calls).toHaveLength(1);
  });

  it('rejects files that are not accepted images or are too large', async () => {
    const {calls, upload} = manualUploader();
    const onReject = vi.fn();
    using editor = buildEditor({maxFileSize: 3, onReject, upload});
    const text = new File(['hi'], 'notes.txt', {type: 'text/plain'});
    const svg = new File(['<svg/>'], 'icon.svg', {type: 'image/svg+xml'});
    const big = png();
    editor.update(
      () => editor.dispatchCommand(DRAG_DROP_PASTE, [text, svg, big]),
      {discrete: true},
    );
    await flush();
    expect(onReject.mock.calls).toEqual([
      [text, 'type'],
      [svg, 'type'],
      [big, 'size'],
    ]);
    expect(calls).toHaveLength(0);
    editor.read(() => expect($getImages()).toHaveLength(0));
  });

  it('uploads long data: URLs and leaves short ones inline', async () => {
    const {calls, upload} = manualUploader();
    using editor = buildEditor({inlineDataUrlMaxLength: 64, upload});
    const short = 'data:image/png;base64,iVBORw0KGgo=';
    const long = `data:image/png;base64,${'A'.repeat(100)}`;
    editor.update(
      () => {
        $insertNodes([
          $createImageNode({src: short}),
          $createImageNode({src: long}),
        ]);
      },
      {discrete: true},
    );
    await flush();
    expect(calls).toHaveLength(1);
    expect(calls[0].file.type).toBe('image/png');
    expect(calls[0].file.size).toBe(75);
    calls[0].result.resolve({src: 'https://example.com/long.png'});
    await flush();
    editor.read(() => {
      expect($getImages().map(image => image.getSrc())).toEqual([
        short,
        'https://example.com/long.png',
      ]);
    });
  });

  it('keeps the local preview on failure and can retry', async () => {
    const {calls, upload} = manualUploader();
    using editor = buildEditor({upload});
    const {retry, uploads} = getExtensionDependencyFromEditor(
      editor,
      ImageUploadExtension,
    ).output;
    editor.update(() => editor.dispatchCommand(DRAG_DROP_PASTE, [png()]), {
      discrete: true,
    });
    await flush();
    const error = new Error('offline');
    calls[0].result.reject(error);
    await flush();
    expect(uploads.value.get('blob:test/1')).toEqual({error, status: 'error'});
    editor.read(() => expect($getImages()[0].getSrc()).toBe('blob:test/1'));

    retry('blob:test/1');
    expect(calls).toHaveLength(2);
    calls[1].result.resolve({src: 'https://example.com/mochi.png'});
    await flush();
    editor.read(() =>
      expect($getImages()[0].getSrc()).toBe('https://example.com/mochi.png'),
    );
  });

  it('resolves waitForUploads once every upload settles', async () => {
    const {calls, upload} = manualUploader();
    using editor = buildEditor({upload});
    const {pendingCount, waitForUploads} = getExtensionDependencyFromEditor(
      editor,
      ImageUploadExtension,
    ).output;
    editor.update(
      () => editor.dispatchCommand(DRAG_DROP_PASTE, [png(), png()]),
      {discrete: true},
    );
    await flush();
    expect(pendingCount.value).toBe(2);
    let done = false;
    const waiting = waitForUploads().then(() => {
      done = true;
    });
    calls[0].result.resolve({src: 'https://example.com/1.png'});
    await flush();
    expect(done).toBe(false);
    calls[1].result.reject(new Error('offline'));
    await waiting;
    expect(pendingCount.value).toBe(0);
  });

  it('keeps local URLs when no uploader is configured', async () => {
    using editor = buildEditor({});
    editor.update(() => editor.dispatchCommand(DRAG_DROP_PASTE, [png()]), {
      discrete: true,
    });
    await flush();
    editor.read(() => expect($getImages()[0].getSrc()).toBe('blob:test/1'));
  });

  it('ignores files when disabled', async () => {
    const {calls, upload} = manualUploader();
    using editor = buildEditor({disabled: true, upload});
    editor.update(() => editor.dispatchCommand(DRAG_DROP_PASTE, [png()]), {
      discrete: true,
    });
    await flush();
    expect(calls).toHaveLength(0);
    editor.read(() => expect($getImages()).toHaveLength(0));
  });
});
