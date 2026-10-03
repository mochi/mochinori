import type {JSX} from 'react';

import {ClipboardDOMImportExtension} from '@lexical/clipboard';
import {HistoryExtension} from '@lexical/history';
import {ContentEditable} from '@lexical/react/LexicalContentEditable';
import {LexicalExtensionComposer} from '@lexical/react/LexicalExtensionComposer';
import {RichTextExtension, RichTextImportExtension} from '@lexical/rich-text';
import {EmojiExtension, EmojiImportExtension} from '@mochinori/emoji';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  configExtension,
  defineExtension,
} from 'lexical';

import styles from './styles.module.css';

const EmojiDemoExtension = defineExtension({
  $initialEditorState: () => {
    $getRoot().append(
      $createParagraphNode().append(
        $createTextNode(
          'Type a short name like :tada: or :man-facepalming:, or a smiley like :) followed by a space. ',
        ),
      ),
      $createParagraphNode().append(
        $createTextNode('Emoji look the same on every platform :+1: '),
      ),
    );
  },
  dependencies: [
    RichTextExtension,
    HistoryExtension,
    configExtension(EmojiExtension, {
      emojiClass: styles.emoji,
      emojiLoadedClass: styles.emojiLoaded,
    }),
    // Pasted emoji keep their shortcode
    ClipboardDOMImportExtension,
    RichTextImportExtension,
    EmojiImportExtension,
  ],
  name: '@mochinori/website/EmojiDemo',
  namespace: 'EmojiDemo',
  theme: {
    paragraph: styles.paragraph,
  },
});

export default function EmojiDemo(): JSX.Element {
  return (
    <div className={styles.demo}>
      <LexicalExtensionComposer
        contentEditable={null}
        extension={EmojiDemoExtension}>
        <ContentEditable
          aria-label="Emoji demo editor"
          className={styles.editor}
        />
      </LexicalExtensionComposer>
    </div>
  );
}
