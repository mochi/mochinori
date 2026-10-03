import type {Signal} from '@lexical/extension';
import type {FormEvent, JSX} from 'react';

import {ClipboardDOMImportExtension} from '@lexical/clipboard';
import {HistoryExtension} from '@lexical/history';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {ContentEditable} from '@lexical/react/LexicalContentEditable';
import {LexicalExtensionComposer} from '@lexical/react/LexicalExtensionComposer';
import {useExtensionDependency} from '@lexical/react/useExtensionComponent';
import {useExtensionSignalValue} from '@lexical/react/useExtensionSignalValue';
import {RichTextExtension, RichTextImportExtension} from '@lexical/rich-text';
import {
  type CustomEmoji,
  EmojiExtension,
  EmojiImportExtension,
  type EmojiSuggestion,
  EmojiTypeaheadExtension,
  INSERT_EMOJI_COMMAND,
} from '@mochinori/emoji';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  configExtension,
  defineExtension,
} from 'lexical';
import {useEffect, useId, useMemo, useReducer, useState} from 'react';
import {createPortal} from 'react-dom';

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
      $createParagraphNode().append(
        $createTextNode(
          'Type :app to pick from suggestions, or use the emoji button. ',
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
    // Suggestions as `:app` is typed, rendered by EmojiTypeaheadMenu
    EmojiTypeaheadExtension,
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
    <form className={styles.form} onSubmit={onSubmit}>
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

// An image for each suggestion, so emoji look the same as in the editor
function SuggestionImage({src}: {src: string}): JSX.Element {
  return <img alt="" className={styles.suggestionImage} src={src} />;
}

// Renders the headless typeahead's state as a menu under the `:query`
function EmojiTypeaheadMenu({id}: {id: string}): JSX.Element | null {
  const [editor] = useLexicalComposerContext();
  const {select, setSelectedIndex} = useExtensionDependency(
    EmojiTypeaheadExtension,
  ).output;
  const state = useExtensionSignalValue(EmojiTypeaheadExtension, 'state');
  // Moves the menu with the text when the page scrolls
  const [, reposition] = useReducer((n: number) => n + 1, 0);
  const view = editor.getRootElement()?.ownerDocument.defaultView;
  useEffect(() => {
    if (!state || !view) {
      return;
    }
    view.addEventListener('scroll', reposition, true);
    view.addEventListener('resize', reposition);
    return () => {
      view.removeEventListener('scroll', reposition, true);
      view.removeEventListener('resize', reposition);
    };
  }, [state, view]);
  const rect = state?.getRect();
  const body = editor.getRootElement()?.ownerDocument.body;
  if (!state || !rect || !body) {
    return null;
  }
  return createPortal(
    <ul
      aria-label="Emoji suggestions"
      className={styles.menu}
      id={id}
      role="listbox"
      style={{left: rect.left, top: rect.bottom + 4}}>
      {state.suggestions.map((suggestion, index) => (
        <li
          aria-selected={index === state.selectedIndex}
          className={styles.menuItem}
          id={`${id}-${index}`}
          key={suggestion.custom ? `:${suggestion.name}` : suggestion.emoji}
          // Keep the focus (and the caret) in the editor
          onMouseDown={event => event.preventDefault()}
          onClick={() => select(index)}
          onMouseEnter={() => setSelectedIndex(index)}
          role="option">
          <SuggestionImage src={suggestion.src} />:{suggestion.name}:
        </li>
      ))}
    </ul>,
    body,
  );
}

// Shown in the picker before anything is searched
const POPULAR = ['+1', 'joy', 'heart', 'tada', 'fire', 'eyes', 'pray', 'wave'];

// An emoji picker built on the extension's searchEmoji
function EmojiPicker(): JSX.Element {
  const [editor] = useLexicalComposerContext();
  const {getEmojiSrc} = useExtensionDependency(EmojiExtension).output;
  const search = useExtensionSignalValue(EmojiExtension, 'searchEmoji');
  const customEmoji = useExtensionSignalValue(EmojiExtension, 'customEmoji');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const results = useMemo((): EmojiSuggestion[] => {
    if (!search) {
      return [];
    }
    if (query) {
      return search(query, {limit: 40});
    }
    return [
      ...customEmoji.map(custom => ({custom, name: custom.name})),
      ...POPULAR.flatMap(name => search(name, {limit: 1})),
    ];
  }, [customEmoji, query, search]);
  const pick = (suggestion: EmojiSuggestion) => {
    editor.update(() => {
      if (!$getSelection()) {
        $getRoot().selectEnd();
      }
    });
    editor.dispatchCommand(INSERT_EMOJI_COMMAND, suggestion);
    setOpen(false);
    setQuery('');
    editor.focus();
  };
  return (
    <div className={styles.picker}>
      <button
        aria-expanded={open}
        className="button button--sm button--secondary"
        onClick={() => setOpen(!open)}
        type="button">
        Emoji
      </button>
      {open && (
        <div className={styles.pickerPanel}>
          <input
            aria-label="Search emoji"
            autoFocus={true}
            className={styles.input}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Escape') {
                setOpen(false);
                editor.focus();
              } else if (event.key === 'Enter' && results[0]) {
                pick(results[0]);
              }
            }}
            placeholder="Search emoji"
            value={query}
          />
          <div className={styles.pickerGrid}>
            {results.map(suggestion => (
              <button
                aria-label={`:${suggestion.name}:`}
                className={styles.pickerItem}
                key={
                  suggestion.custom ? `:${suggestion.name}` : suggestion.emoji
                }
                onClick={() => pick(suggestion)}
                title={`:${suggestion.name}:`}
                type="button">
                <SuggestionImage src={getEmojiSrc(suggestion)} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// The editor, announced as a combobox while the typeahead is open
function EmojiEditor(): JSX.Element {
  const id = useId();
  const state = useExtensionSignalValue(EmojiTypeaheadExtension, 'state');
  return (
    <>
      <ContentEditable
        aria-activedescendant={
          state ? `${id}-${state.selectedIndex}` : undefined
        }
        aria-autocomplete="list"
        aria-controls={state ? id : undefined}
        aria-expanded={state !== null}
        aria-label="Emoji demo editor"
        className={styles.editor}
        role="combobox"
      />
      <EmojiTypeaheadMenu id={id} />
    </>
  );
}

export default function EmojiDemo(): JSX.Element {
  return (
    <div className={styles.demo}>
      <LexicalExtensionComposer
        contentEditable={null}
        extension={EmojiDemoExtension}>
        <div className={styles.toolbar}>
          <EmojiPicker />
          <CustomEmojiForm />
        </div>
        <EmojiEditor />
      </LexicalExtensionComposer>
    </div>
  );
}
