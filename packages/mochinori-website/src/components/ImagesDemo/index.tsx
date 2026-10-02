import type {FormEvent, JSX} from 'react';

import {ClipboardDOMImportExtension} from '@lexical/clipboard';
import {HistoryExtension} from '@lexical/history';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {ContentEditable} from '@lexical/react/LexicalContentEditable';
import {LexicalExtensionComposer} from '@lexical/react/LexicalExtensionComposer';
import {RichTextExtension, RichTextImportExtension} from '@lexical/rich-text';
import {
  ImagesExtension,
  ImagesImportExtension,
  INSERT_IMAGE_COMMAND,
} from '@mochinori/images';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  defineExtension,
} from 'lexical';
import {useState} from 'react';

import styles from './styles.module.css';

const SAMPLE_IMAGES = [
  {altText: 'The mochinori mark', src: '/img/logo/mochinori-mark.svg'},
  {altText: 'The mochinori icon', src: '/img/logo/mochinori-icon.svg'},
];

const ImagesDemoExtension = defineExtension({
  $initialEditorState: () => {
    $getRoot().append(
      $createParagraphNode().append(
        $createTextNode(
          'Insert an image with the toolbar, or paste HTML that contains one. ',
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
