import type {FormEvent, JSX} from 'react';

import {ClipboardDOMImportExtension} from '@lexical/clipboard';
import {signal} from '@lexical/extension';
import {HistoryExtension} from '@lexical/history';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {ContentEditable} from '@lexical/react/LexicalContentEditable';
import {LexicalExtensionComposer} from '@lexical/react/LexicalExtensionComposer';
import {useExtensionDependency} from '@lexical/react/useExtensionComponent';
import {
  useExtensionSignalValue,
  useSignalValue,
} from '@lexical/react/useExtensionSignalValue';
import {RichTextExtension, RichTextImportExtension} from '@lexical/rich-text';
import {
  createHttpImageMirror,
  createHttpImageUploader,
  createImageResizer,
  type ImageRejectionReason,
  ImagesExtension,
  ImagesImportExtension,
  ImageUploadExtension,
  INSERT_IMAGE_COMMAND,
} from '@mochinori/images';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  configExtension,
  defineExtension,
} from 'lexical';
import {useState} from 'react';

import styles from './styles.module.css';

const SAMPLE_IMAGES = [
  {altText: 'The mochinori mark', src: '/img/logo/mochinori-mark.svg'},
  {altText: 'The mochinori icon', src: '/img/logo/mochinori-icon.svg'},
];

// The last file the editor turned away, shown under the toolbar
const rejection = /* @__PURE__ */ signal<string | null>(null);

function onReject(file: File, reason: ImageRejectionReason) {
  rejection.value =
    reason === 'type'
      ? `${file.name || 'That file'} isn't a PNG, JPEG, GIF, WebP or AVIF image.`
      : `${file.name || 'That image'} is too large to upload.`;
}

const ImagesDemoExtension = defineExtension({
  $initialEditorState: () => {
    $getRoot().append(
      $createParagraphNode().append(
        $createTextNode(
          'Paste or drop an image, upload one, or insert one with the toolbar. ',
        ),
      ),
    );
  },
  dependencies: [
    RichTextExtension,
    HistoryExtension,
    ImagesExtension,
    // Route HTML pastes through DOMImportExtension, where the import rules
    // for rich text and images are registered
    ClipboardDOMImportExtension,
    RichTextImportExtension,
    ImagesImportExtension,
    configExtension(ImageUploadExtension, {
      // The same limit the site's Worker enforces, checked after resizing
      maxFileSize: 5 * 1024 * 1024,
      // Images in HTML pasted from other sites are copied by the Worker
      mirror: createHttpImageMirror({url: '/api/images'}),
      onReject,
      // The demo shrinks images early to keep storage small. For uploads as
      // close to lossless as possible, set only maxBytes to the limit
      prepareUpload: createImageResizer({
        maxBytes: 1024 * 1024,
        maxHeight: 1600,
        maxWidth: 1600,
        quality: 0.8,
      }),
      // The site's Worker stores uploads in R2 for one hour
      upload: createHttpImageUploader({url: '/api/images'}),
    }),
  ],
  name: '@mochinori/website/ImagesDemo',
  namespace: 'ImagesDemo',
  theme: {
    image: styles.image,
    paragraph: styles.paragraph,
  },
});

function Toolbar(): JSX.Element {
  const [editor] = useLexicalComposerContext();
  const {openFileDialog} = useExtensionDependency(ImageUploadExtension).output;
  const pendingCount = useExtensionSignalValue(
    ImageUploadExtension,
    'pendingCount',
  );
  const rejected = useSignalValue(rejection);
  const [url, setUrl] = useState('');
  const [sample, setSample] = useState(0);

  const insertSample = () => {
    editor.dispatchCommand(INSERT_IMAGE_COMMAND, {
      ...SAMPLE_IMAGES[sample % SAMPLE_IMAGES.length],
      height: 96,
      width: 96,
    });
    setSample(sample + 1);
  };
  const insertUrl = (event: FormEvent) => {
    event.preventDefault();
    if (url) {
      editor.dispatchCommand(INSERT_IMAGE_COMMAND, {altText: '', src: url});
      setUrl('');
    }
  };

  return (
    <div className={styles.toolbar}>
      <button
        className="button button--sm button--primary"
        onClick={openFileDialog}
        type="button">
        Upload image
      </button>
      <button
        className="button button--sm button--secondary"
        onClick={insertSample}
        type="button">
        Insert sample image
      </button>
      <form className={styles.urlForm} onSubmit={insertUrl}>
        <input
          aria-label="Image URL"
          className={styles.urlInput}
          onChange={event => setUrl(event.target.value)}
          placeholder="https://example.com/image.png"
          type="url"
          value={url}
        />
        <button
          className="button button--sm button--secondary"
          disabled={!url}
          type="submit">
          Insert from URL
        </button>
      </form>
      <span aria-live="polite" className={styles.status}>
        {pendingCount > 0
          ? `Uploading ${pendingCount} image${pendingCount === 1 ? '' : 's'}…`
          : rejected}
      </span>
    </div>
  );
}

export default function ImagesDemo(): JSX.Element {
  return (
    <div className={styles.demo}>
      <LexicalExtensionComposer
        contentEditable={null}
        extension={ImagesDemoExtension}>
        <Toolbar />
        <ContentEditable
          aria-label="Image demo editor"
          className={styles.editor}
        />
      </LexicalExtensionComposer>
    </div>
  );
}
