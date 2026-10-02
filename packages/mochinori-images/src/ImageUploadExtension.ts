import {
  computed,
  effect,
  namedSignals,
  type ReadonlySignal,
  signal,
} from '@lexical/extension';
import {DRAG_DROP_PASTE} from '@lexical/rich-text';
import {
  $getNodeByKey,
  $getRoot,
  $insertNodes,
  $isElementNode,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_LOW,
  createCommand,
  defineExtension,
  HISTORY_MERGE_TAG,
  type LexicalCommand,
  type LexicalEditor,
  type LexicalNode,
  safeCast,
} from 'lexical';

import {$createImageNode, $isImageNode, ImageNode} from './ImageNode.tsx';
import {ImagesExtension} from './ImagesExtension.ts';

/** Options passed to an {@link ImageUploader} */
export interface ImageUploadOptions {
  /** Aborted when the editor is disposed */
  signal: AbortSignal;
  /** Report upload progress as a fraction from 0 to 1 */
  onProgress: (fraction: number) => void;
}

/**
 * Uploads one image and resolves to the URL it is served from. Reject (or
 * throw) to put the image in the error state, where it can be retried.
 */
export type ImageUploader = (
  file: Blob,
  options: ImageUploadOptions,
) => Promise<{src: string}>;

/** Options passed to an {@link ImageMirror} */
export interface ImageMirrorOptions {
  /** Aborted when the editor is disposed */
  signal: AbortSignal;
}

/**
 * Copies a remote image (an `http:` or `https:` URL from another origin) to
 * your own storage and resolves to the URL it is served from. The copy has
 * to happen on a server: browsers can't read most cross-origin images.
 */
export type ImageMirror = (
  src: string,
  options: ImageMirrorOptions,
) => Promise<{src: string}>;

/** Options passed to an {@link ImagePreparer} */
export interface ImagePrepareOptions {
  /** Aborted when the editor is disposed */
  signal: AbortSignal;
}

/**
 * Turns a local image into the data to upload, for example by downscaling
 * it (see {@link createImageResizer}). Return the image itself to upload it
 * unchanged.
 */
export type ImagePreparer = (
  image: Blob,
  options: ImagePrepareOptions,
) => Promise<Blob>;

/**
 * The error an upload fails with when the image is still larger than
 * `maxFileSize` after `prepareUpload`
 */
export class ImageTooLargeError extends Error {
  constructor(
    readonly size: number,
    readonly maxFileSize: number,
  ) {
    super(`The image is ${size} bytes, more than the limit of ${maxFileSize}`);
    this.name = 'ImageTooLargeError';
  }
}

/** Why a file was not inserted */
export type ImageRejectionReason = 'type' | 'size';

export interface ImageUploadConfig {
  /**
   * When true, files are not inserted or uploaded. Images already uploading
   * finish.
   */
  disabled: boolean;
  /**
   * Uploads image data. Without one, images keep their local `blob:` or
   * `data:` URL.
   */
  upload: ImageUploader | null;
  /**
   * Copies remote images to your own storage. Without one, images keep
   * their remote URL.
   */
  mirror: ImageMirror | null;
  /**
   * Whether an `http:` or `https:` image is already served from your own
   * storage, so it is not mirrored. Images this extension uploaded or
   * mirrored always count as hosted. When null, images from the editor's own
   * origin count as hosted.
   */
  isHostedSrc: null | ((src: string) => boolean);
  /**
   * `data:` URLs up to this many characters stay inline in the document;
   * longer ones are uploaded. `blob:` URLs are always uploaded, since they
   * only work in the page that created them.
   */
  inlineDataUrlMaxLength: number;
  /** MIME types accepted from paste, drop and the file dialog */
  accept: readonly string[];
  /**
   * Largest image uploaded, in bytes. Without `prepareUpload`, larger files
   * are rejected before they are inserted. With it, they are inserted, and
   * the limit applies to what `prepareUpload` returns.
   */
  maxFileSize: number;
  /**
   * Runs on each local image before it is uploaded. Use
   * {@link createImageResizer} to downscale photos, which are often larger
   * than an upload limit.
   */
  prepareUpload: ImagePreparer | null;
  /** Called for each pasted, dropped or chosen file that is not inserted */
  onReject: null | ((file: File, reason: ImageRejectionReason) => void);
}

/** The state of the upload or mirror of one image URL */
export type ImageUploadState =
  | {status: 'uploading'; progress: number | null}
  | {status: 'uploaded'; src: string}
  | {status: 'error'; error: unknown};

export interface ImageUploadOutput {
  /**
   * Upload state, keyed by the image's original URL: a local `blob:` or
   * `data:` URL that is uploaded, or a remote URL that is mirrored
   */
  uploads: ReadonlySignal<ReadonlyMap<string, ImageUploadState>>;
  /** The number of uploads and mirrors that are still in progress */
  pendingCount: ReadonlySignal<number>;
  /**
   * Opens the browser's file dialog and inserts the chosen images at the
   * current selection
   */
  openFileDialog: () => void;
  /** Starts a failed upload or mirror again */
  retry: (src: string) => void;
  /**
   * Resolves once no upload is in progress. Wait for this before saving,
   * so the saved document does not contain local URLs.
   */
  waitForUploads: () => Promise<void>;
}

/** Inserts image files at the current selection and uploads them */
export const INSERT_IMAGE_FILES_COMMAND: LexicalCommand<File[]> = createCommand(
  'INSERT_IMAGE_FILES_COMMAND',
);

const DEFAULT_ACCEPT = [
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
];

function isLocalSrc(src: string): boolean {
  return src.startsWith('blob:') || src.startsWith('data:');
}

function isRemoteSrc(src: string): boolean {
  return src.startsWith('https:') || src.startsWith('http:');
}

function $walkImageNodes(
  node: LexicalNode,
  visit: (image: ImageNode) => void,
): void {
  if ($isImageNode(node)) {
    visit(node);
  } else if ($isElementNode(node)) {
    for (const child of node.getChildren()) {
      $walkImageNodes(child, visit);
    }
  }
}

/** Waits until the browser can paint `src`, so swapping to it never flashes */
async function preloadImage(editor: LexicalEditor, src: string): Promise<void> {
  const doc = editor.getRootElement()?.ownerDocument;
  if (!doc) {
    return;
  }
  const img = doc.createElement('img');
  img.src = src;
  if (typeof img.decode === 'function') {
    await img.decode();
  }
}

/**
 * Tracks image uploads. Images pasted, dropped or chosen in the file dialog
 * are inserted immediately with a local `blob:` URL as the preview, and
 * uploaded with the configured {@link ImageUploader}. When the upload
 * finishes and the uploaded image has loaded, the node switches to the
 * uploaded URL. That switch is merged into the insertion's undo history
 * entry, so undo and redo never bring the local URL back.
 *
 * Any {@link ImageNode} whose `src` is a `blob:` URL, or a `data:` URL
 * longer than `inlineDataUrlMaxLength`, is uploaded the same way, whether
 * it came from HTML paste, JSON or `$createImageNode`. With a `mirror`,
 * an image from another origin (such as one in HTML pasted from another
 * site) is copied to your storage and switched over the same way, while
 * images already hosted by you (see `isHostedSrc`) are left alone.
 *
 * Depends on `RichTextExtension`'s `DRAG_DROP_PASTE` command for pasted and
 * dropped files, so add `RichTextExtension` (or another source of that
 * command) to the editor.
 */
export const ImageUploadExtension = defineExtension({
  build: (editor, config) => {
    const configSignals = namedSignals(config);
    const uploads = signal<ReadonlyMap<string, ImageUploadState>>(new Map());
    const pendingCount = computed(() => {
      let count = 0;
      for (const upload of uploads.value.values()) {
        if (upload.status === 'uploading') {
          count++;
        }
      }
      return count;
    });
    const controller = new AbortController();
    // Files inserted by this extension, by the object URL created for them
    const files = new Map<string, Blob>();
    // URLs returned by the uploader or mirror
    const hosted = new Set<string>();

    const isHosted = (src: string): boolean => {
      if (hosted.has(src)) {
        return true;
      }
      const isHostedSrc = configSignals.isHostedSrc.peek();
      if (isHostedSrc) {
        return isHostedSrc(src);
      }
      const doc = editor.getRootElement()?.ownerDocument;
      const origin = doc?.defaultView?.location.origin;
      try {
        return !!doc && new URL(src, doc.baseURI).origin === origin;
      } catch {
        return false;
      }
    };

    const setUpload = (localSrc: string, upload: ImageUploadState) => {
      const next = new Map(uploads.peek());
      next.set(localSrc, upload);
      uploads.value = next;
    };

    const swapToUploaded = (localSrc: string, src: string) => {
      editor.update(
        () => {
          $walkImageNodes($getRoot(), image => {
            if (image.getSrc() === localSrc) {
              image.setSrc(src);
            }
          });
        },
        {tag: HISTORY_MERGE_TAG},
      );
    };

    // Uploads a local image, or mirrors a remote one
    const startUpload = (localSrc: string) => {
      const local = isLocalSrc(localSrc);
      const upload = configSignals.upload.peek();
      const mirror = configSignals.mirror.peek();
      const current = uploads.peek().get(localSrc);
      if (
        !(local ? upload : mirror) ||
        controller.signal.aborted ||
        (current && current.status !== 'error')
      ) {
        return;
      }
      setUpload(localSrc, {progress: null, status: 'uploading'});
      (async () => {
        let result: {src: string};
        if (upload && local) {
          const original =
            files.get(localSrc) ?? (await (await fetch(localSrc)).blob());
          const prepare = configSignals.prepareUpload.peek();
          const blob = prepare
            ? await prepare(original, {signal: controller.signal})
            : original;
          const maxFileSize = configSignals.maxFileSize.peek();
          if (blob.size > maxFileSize) {
            throw new ImageTooLargeError(blob.size, maxFileSize);
          }
          result = await upload(blob, {
            onProgress: progress => {
              if (uploads.peek().get(localSrc)?.status === 'uploading') {
                setUpload(localSrc, {progress, status: 'uploading'});
              }
            },
            signal: controller.signal,
          });
        } else if (mirror) {
          result = await mirror(localSrc, {signal: controller.signal});
        } else {
          throw new Error('No uploader');
        }
        await preloadImage(editor, result.src);
        return result.src;
      })().then(
        src => {
          hosted.add(src);
          setUpload(localSrc, {src, status: 'uploaded'});
          swapToUploaded(localSrc, src);
        },
        error => {
          if (!controller.signal.aborted) {
            setUpload(localSrc, {error, status: 'error'});
          }
        },
      );
    };

    const $insertFiles = (fileList: readonly File[]): boolean => {
      const {accept, maxFileSize, onReject, prepareUpload} = configSignals;
      const nodes = [];
      for (const file of fileList) {
        if (!accept.peek().includes(file.type)) {
          onReject.peek()?.(file, 'type');
        } else if (!prepareUpload.peek() && file.size > maxFileSize.peek()) {
          onReject.peek()?.(file, 'size');
        } else {
          const localSrc = URL.createObjectURL(file);
          files.set(localSrc, file);
          nodes.push($createImageNode({src: localSrc}));
        }
      }
      if (nodes.length > 0) {
        $insertNodes(nodes);
      }
      return nodes.length > 0;
    };

    const openFileDialog = () => {
      const doc = editor.getRootElement()?.ownerDocument;
      if (!doc || configSignals.disabled.peek()) {
        return;
      }
      const input = doc.createElement('input');
      input.type = 'file';
      input.accept = configSignals.accept.peek().join(',');
      input.multiple = true;
      // In the document while the dialog is open: iOS Safari can drop the
      // change event of a detached file input
      input.hidden = true;
      doc.body.append(input);
      input.addEventListener('change', () => {
        input.remove();
        const chosen = Array.from(input.files ?? []);
        if (chosen.length > 0) {
          editor.dispatchCommand(INSERT_IMAGE_FILES_COMMAND, chosen);
        }
      });
      input.addEventListener('cancel', () => input.remove());
      input.click();
    };

    const waitForUploads = () =>
      new Promise<void>(resolve => {
        const dispose = effect(() => {
          if (pendingCount.value === 0) {
            // effect runs synchronously the first time, before `dispose`
            // is assigned, so defer the cleanup
            queueMicrotask(() => dispose());
            resolve();
          }
        });
      });

    return {
      ...configSignals,
      $insertFiles,
      controller,
      files,
      isHosted,
      openFileDialog,
      pendingCount,
      retry: (src: string) => {
        if (uploads.peek().get(src)?.status === 'error') {
          startUpload(src);
        }
      },
      startUpload,
      swapToUploaded,
      uploads,
      waitForUploads,
    };
  },
  config: safeCast<ImageUploadConfig>({
    accept: DEFAULT_ACCEPT,
    disabled: false,
    inlineDataUrlMaxLength: 1024,
    isHostedSrc: null,
    maxFileSize: 10 * 1024 * 1024,
    mirror: null,
    onReject: null,
    prepareUpload: null,
    upload: null,
  }),
  dependencies: [ImagesExtension],
  name: '@mochinori/images/ImageUpload',
  register: (editor, _config, state) => {
    const output = state.getOutput();
    const {disabled, inlineDataUrlMaxLength, uploads} = output;
    const needsUpload = (src: string) =>
      src.startsWith('blob:') ||
      (src.startsWith('data:') && src.length > inlineDataUrlMaxLength.peek()) ||
      (isRemoteSrc(src) && !!output.mirror.peek() && !output.isHosted(src));

    // Called for every new or changed image, from a transform or after
    // undo/redo or setEditorState. Returns the uploaded URL to swap to.
    const check = (src: string): string | null => {
      if (!isLocalSrc(src) && !isRemoteSrc(src)) {
        return null;
      }
      const upload = uploads.peek().get(src);
      if (upload?.status === 'uploaded') {
        return upload.src;
      }
      if (!upload && !disabled.peek() && needsUpload(src)) {
        // Uploads start after the update that created the image commits
        queueMicrotask(() => output.startUpload(src));
      }
      return null;
    };

    const cleanup = [
      () => {
        output.controller.abort();
        for (const localSrc of output.files.keys()) {
          URL.revokeObjectURL(localSrc);
        }
        output.files.clear();
      },
      editor.registerNodeTransform(ImageNode, node => {
        const src = check(node.getSrc());
        if (src !== null) {
          node.setSrc(src);
        }
      }),
      // Transforms do not run for undo, redo or setEditorState
      editor.registerMutationListener(
        ImageNode,
        mutations => {
          editor.read('latest', () => {
            for (const [key, mutation] of mutations) {
              const node = mutation === 'destroyed' ? null : $getNodeByKey(key);
              if ($isImageNode(node)) {
                const localSrc = node.getSrc();
                const src = check(localSrc);
                if (src !== null) {
                  output.swapToUploaded(localSrc, src);
                }
              }
            }
          });
        },
        {skipInitialization: true},
      ),
      effect(() => {
        if (disabled.value) {
          return;
        }
        return editor.registerCommand(
          INSERT_IMAGE_FILES_COMMAND,
          fileList => output.$insertFiles(fileList),
          COMMAND_PRIORITY_EDITOR,
        );
      }),
      effect(() => {
        if (disabled.value) {
          return;
        }
        return editor.registerCommand(
          DRAG_DROP_PASTE,
          fileList =>
            editor.dispatchCommand(INSERT_IMAGE_FILES_COMMAND, fileList),
          COMMAND_PRIORITY_LOW,
        );
      }),
    ];
    return () => {
      for (const fn of cleanup.reverse()) {
        fn();
      }
    };
  },
});
