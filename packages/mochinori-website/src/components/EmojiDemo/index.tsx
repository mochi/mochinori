import type {Signal} from '@lexical/extension';
import type {FormEvent, JSX} from 'react';

import {ClipboardDOMImportExtension} from '@lexical/clipboard';
import {HistoryExtension} from '@lexical/history';
import {ContentEditable} from '@lexical/react/LexicalContentEditable';
import {LexicalExtensionComposer} from '@lexical/react/LexicalExtensionComposer';
import {useExtensionDependency} from '@lexical/react/useExtensionComponent';
import {useExtensionSignalValue} from '@lexical/react/useExtensionSignalValue';
import {RichTextExtension, RichTextImportExtension} from '@lexical/rich-text';
import {
  type CustomEmoji,
  EmojiExtension,
  EmojiImportExtension,
} from '@mochinori/emoji';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  configExtension,
  defineExtension,
} from 'lexical';
import {useState} from 'react';

import styles from './styles.module.css';

// Custom emoji beyond the Unicode set, like a Slack workspace's. They stand
// in for a server's list, which the editor asks for as names are typed or
// appear in the document instead of loading all of them up front.
const SERVER_EMOJI: CustomEmoji[] = [
  {name: 'mochinori', src: '/img/logo/mochinori-mark.svg'},
  {name: 'mochi', src: '/img/logo/mochinori-icon.svg'},
];

function lookupCustomEmoji(
  query: string,
  signal: AbortSignal,
): Promise<readonly CustomEmoji[]> {
  return new Promise(resolve => {
    // A short delay, as if over the network
    const timer = setTimeout(
      () => resolve(SERVER_EMOJI.filter(emoji => emoji.name.startsWith(query))),
      300,
    );
    signal.addEventListener('abort', () => clearTimeout(timer), {once: true});
  });
}

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
      $createParagraphNode().append(
        $createTextNode(
          'Custom emoji go beyond Unicode: :mochinori: and :mochi: ',
        ),
      ),
    );
  },
  dependencies: [
    RichTextExtension,
    HistoryExtension,
    configExtension(EmojiExtension, {
      emojiClass: styles.emoji,
      emojiLoadedClass: styles.emojiLoaded,
      lookupCustomEmoji,
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

// Adds a custom emoji, or replaces the one with the same name
function addCustomEmoji(
  customEmoji: Signal<readonly CustomEmoji[]>,
  emoji: CustomEmoji,
) {
  customEmoji.value = [
    ...customEmoji.value.filter(e => e.name !== emoji.name),
    emoji,
  ];
}

// Adds custom emoji while the editor runs
function CustomEmojiForm(): JSX.Element {
  const {customEmoji} = useExtensionDependency(EmojiExtension).output;
  const emoji = useExtensionSignalValue(EmojiExtension, 'customEmoji');
  const [name, setName] = useState('');
  const [src, setSrc] = useState('');
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim().replace(/^:|:$/g, '');
    if (trimmed && src) {
      addCustomEmoji(customEmoji, {name: trimmed, src});
      setName('');
      setSrc('');
    }
  };
  return (
    <form className={styles.toolbar} onSubmit={onSubmit}>
      <span className={styles.label}>
        Custom emoji:{' '}
        {emoji.map(e => (
          <code key={e.name}>:{e.name}:</code>
        ))}
      </span>
      <input
        aria-label="Custom emoji name"
        className={styles.input}
        onChange={event => setName(event.target.value)}
        pattern="[^\s:]+"
        placeholder="name"
        value={name}
      />
      <input
        aria-label="Custom emoji image URL"
        className={styles.input}
        onChange={event => setSrc(event.target.value)}
        placeholder="https://example.com/emoji.png"
        type="url"
        value={src}
      />
      <button
        className="button button--sm button--secondary"
        disabled={!name.trim() || !src}
        type="submit">
        Add custom emoji
      </button>
    </form>
  );
}

export default function EmojiDemo(): JSX.Element {
  return (
    <div className={styles.demo}>
      <LexicalExtensionComposer
        contentEditable={null}
        extension={EmojiDemoExtension}>
        <CustomEmojiForm />
        <ContentEditable
          aria-label="Emoji demo editor"
          className={styles.editor}
        />
      </LexicalExtensionComposer>
    </div>
  );
}
