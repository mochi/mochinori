import type {Signal} from '@lexical/extension';
import type {FormEvent, JSX} from 'react';

import {ClipboardDOMImportExtension} from '@lexical/clipboard';
import {HistoryExtension} from '@lexical/history';
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  MdastExtension,
} from '@lexical/mdast';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {ContentEditable} from '@lexical/react/LexicalContentEditable';
import {LexicalExtensionComposer} from '@lexical/react/LexicalExtensionComposer';
import {useExtensionDependency} from '@lexical/react/useExtensionComponent';
import {useExtensionSignalValue} from '@lexical/react/useExtensionSignalValue';
import {RichTextExtension} from '@lexical/rich-text';
import {
  $getSelectionStyleValueForProperty,
  $patchStyleText,
} from '@lexical/selection';
import {
  type CustomEmoji,
  EMOJI_SETS,
  EmojiExtension,
  type EmojiSet,
  type EmojiSuggestion,
  EmojiTypeaheadExtension,
  INSERT_EMOJI_COMMAND,
  SKIN_TONES,
  type SkinTone,
} from '@mochinori/emoji';
import {EmojiMdastExtension} from '@mochinori/emoji/mdast';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  configExtension,
  defineExtension,
} from 'lexical';
import {useEffect, useId, useMemo, useReducer, useRef, useState} from 'react';
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

// The demo's starting document
function $initialContent() {
  $getRoot().append(
    $createParagraphNode().append(
      $createTextNode(
        'Type a short name like :tada: or :man-facepalming:, or a smiley like :) followed by a space.',
      ),
    ),
    $createParagraphNode().append(
      $createTextNode('Emoji look the same on every platform :+1:'),
    ),
    $createParagraphNode().append(
      $createTextNode(
        'Custom emoji go beyond Unicode: :mochinori: and :mochi:',
      ),
    ),
    $createParagraphNode().append(
      $createTextNode(
        'Type :app to pick from suggestions, or use the emoji button. Add a skin tone with :wave::skin-tone-4:',
      ),
    ),
  );
}

const EmojiDemoExtension = defineExtension({
  $initialEditorState: $initialContent,
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
    // Markdown with emoji, shown under the editor
    MdastExtension,
    EmojiMdastExtension,
  ],
  name: '@mochinori/website/EmojiDemo',
  namespace: 'EmojiDemo',
  theme: {
    paragraph: styles.paragraph,
  },
});

const EMOJI_SET_NAMES: Record<EmojiSet, string> = {
  google: 'Noto emoji',
  twitter: 'Twemoji',
};

// Picks the emoji images, which the editor redraws in place
function EmojiSetSelect(): JSX.Element {
  const {emojiSet} = useExtensionDependency(EmojiExtension).output;
  const current = useExtensionSignalValue(EmojiExtension, 'emojiSet');
  return (
    <select
      aria-label="Emoji images"
      className={styles.input}
      onChange={event => {
        const next = EMOJI_SETS.find(set => set === event.target.value);
        if (next) {
          setOption(emojiSet, next);
        }
      }}
      value={current}>
      {EMOJI_SETS.map(set => (
        <option key={set} value={set}>
          {EMOJI_SET_NAMES[set]}
        </option>
      ))}
    </select>
  );
}

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
function SuggestionImage({
  lazy = false,
  src,
}: {
  lazy?: boolean;
  src: string;
}): JSX.Element {
  return (
    <img
      alt=""
      className={styles.suggestionImage}
      loading={lazy ? 'lazy' : undefined}
      src={src}
    />
  );
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

const FONT_FAMILIES = [
  'Arial',
  'Courier New',
  'Georgia',
  'Times New Roman',
  'Trebuchet MS',
  'Verdana',
];
const FONT_SIZES = ['10px', '12px', '15px', '18px', '24px', '32px', '48px'];

// Font family and size for the selected text, as in the Lexical playground,
// to check that emoji sit right in any font and at any size
function FontControls(): JSX.Element {
  const [editor] = useLexicalComposerContext();
  const [fontFamily, setFontFamily] = useState('');
  const [fontSize, setFontSize] = useState('');
  useEffect(
    () =>
      editor.registerUpdateListener(({editorState}) => {
        editorState.read(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            setFontFamily(
              $getSelectionStyleValueForProperty(selection, 'font-family', ''),
            );
            setFontSize(
              $getSelectionStyleValueForProperty(selection, 'font-size', ''),
            );
          }
        });
      }),
    [editor],
  );
  const apply = (property: 'font-family' | 'font-size', value: string) => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        $patchStyleText(selection, {[property]: value || null});
      }
    });
    editor.focus();
  };
  return (
    <>
      <select
        aria-label="Font family"
        className={styles.input}
        onChange={event => apply('font-family', event.target.value)}
        value={fontFamily}>
        <option value="">Default font</option>
        {FONT_FAMILIES.map(family => (
          <option key={family} value={family}>
            {family}
          </option>
        ))}
      </select>
      <select
        aria-label="Font size"
        className={styles.input}
        onChange={event => apply('font-size', event.target.value)}
        value={fontSize}>
        <option value="">Default size</option>
        {FONT_SIZES.map(size => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>
    </>
  );
}

// A hand in each skin tone, for the skin tone menu
const TONE_HANDS: Record<SkinTone, string> = {
  1: '✋',
  2: '✋🏻',
  3: '✋🏼',
  4: '✋🏽',
  5: '✋🏾',
  6: '✋🏿',
};

// The picker's skin tone menu, which sets the extension's skinTone signal
function SkinToneMenu(): JSX.Element {
  const {getEmojiSrc, skinTone} = useExtensionDependency(EmojiExtension).output;
  // Redraw with the current emoji set
  useExtensionSignalValue(EmojiExtension, 'emojiBaseUrl');
  const current = useExtensionSignalValue(EmojiExtension, 'skinTone');
  const [open, setOpen] = useState(false);
  const hand = (tone: SkinTone) =>
    getEmojiSrc({emoji: TONE_HANDS[tone], name: 'raised_hand'});
  return (
    <div className={styles.toneMenu}>
      <button
        aria-expanded={open}
        aria-label="Skin tone"
        className={styles.pickerItem}
        onClick={() => setOpen(!open)}
        title="Skin tone"
        type="button">
        <SuggestionImage src={hand(current)} />
      </button>
      {open &&
        SKIN_TONES.filter(tone => tone !== current).map(tone => (
          <button
            aria-label={`Skin tone ${tone}`}
            className={styles.pickerItem}
            key={tone}
            onClick={() => {
              skinTone.value = tone;
              setOpen(false);
            }}
            type="button">
            <SuggestionImage src={hand(tone)} />
          </button>
        ))}
    </div>
  );
}

// An emoji picker built on the extension's searchEmoji and emojiCategories,
// with a section for each category and the custom emoji first
function EmojiPicker(): JSX.Element {
  const [editor] = useLexicalComposerContext();
  const {getEmojiSrc} = useExtensionDependency(EmojiExtension).output;
  // Redraw with the current emoji set
  useExtensionSignalValue(EmojiExtension, 'emojiBaseUrl');
  const search = useExtensionSignalValue(EmojiExtension, 'searchEmoji');
  const categories = useExtensionSignalValue(EmojiExtension, 'emojiCategories');
  const customEmoji = useExtensionSignalValue(EmojiExtension, 'customEmoji');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const gridRef = useRef<HTMLDivElement>(null);
  const sections = useMemo((): {
    emoji: readonly EmojiSuggestion[];
    name: string;
  }[] => {
    if (query) {
      return search
        ? [{emoji: search(query, {limit: 64}), name: 'Results'}]
        : [];
    }
    return [
      ...(customEmoji.length > 0
        ? [
            {
              emoji: customEmoji.map(custom => ({custom, name: custom.name})),
              name: 'Custom',
            },
          ]
        : []),
      ...(categories ?? []),
    ];
  }, [categories, customEmoji, query, search]);
  const firstResult = sections[0]?.emoji[0];
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
        <div
          className={styles.pickerPanel}
          // Escape anywhere in the picker closes it
          onKeyDown={event => {
            if (event.key === 'Escape') {
              setOpen(false);
              editor.focus();
            }
          }}>
          <div className={styles.pickerHeader}>
            <input
              aria-label="Search emoji"
              autoFocus={true}
              className={styles.input}
              onChange={event => setQuery(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && firstResult) {
                  pick(firstResult);
                }
              }}
              placeholder="Search emoji"
              value={query}
            />
            <SkinToneMenu />
          </div>
          {!query && (
            <div className={styles.pickerTabs} role="tablist">
              {sections.map(section => {
                const [icon] = section.emoji;
                return (
                  icon && (
                    <button
                      aria-label={section.name}
                      className={styles.pickerItem}
                      key={section.name}
                      onClick={() => {
                        // Scrolls the grid only, not the page
                        const grid = gridRef.current;
                        const target = grid?.querySelector<HTMLElement>(
                          `[data-section="${section.name}"]`,
                        );
                        if (grid && target) {
                          grid.scrollTop = target.offsetTop - grid.offsetTop;
                        }
                      }}
                      role="tab"
                      title={section.name}
                      type="button">
                      <SuggestionImage src={getEmojiSrc(icon)} />
                    </button>
                  )
                );
              })}
            </div>
          )}
          <div className={styles.pickerScroll} ref={gridRef}>
            {sections.map(section => (
              <section data-section={section.name} key={section.name}>
                <h4 className={styles.pickerHeading}>{section.name}</h4>
                <div className={styles.pickerGrid}>
                  {section.emoji.map(suggestion => (
                    <button
                      aria-label={`:${suggestion.name}:`}
                      className={styles.pickerItem}
                      key={
                        suggestion.custom
                          ? `:${suggestion.name}`
                          : suggestion.emoji
                      }
                      onClick={() => pick(suggestion)}
                      title={`:${suggestion.name}:`}
                      type="button">
                      <SuggestionImage
                        lazy={true}
                        src={getEmojiSrc(suggestion)}
                      />
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Sets an extension's option signal (outside render, so React allows it)
function setOption<T>(option: Signal<T>, value: T): void {
  option.value = value;
}

// A checkbox for a boolean option signal
function OptionCheckbox({
  label,
  option,
}: {
  label: string;
  option: Signal<boolean>;
}): JSX.Element {
  const [checked, setChecked] = useState(option.peek());
  useEffect(() => option.subscribe(setChecked), [option]);
  return (
    <label className={styles.option}>
      <input
        checked={checked}
        onChange={event => setOption(option, event.target.checked)}
        type="checkbox"
      />{' '}
      {label}
    </label>
  );
}

// The editor's setting for Unicode emoji typed, pasted or imported
function UnicodeEmojiOption(): JSX.Element {
  const {convertUnicodeEmoji} = useExtensionDependency(EmojiExtension).output;
  return (
    <OptionCheckbox
      label="Unicode emoji as images"
      option={convertUnicodeEmoji}
    />
  );
}

// How Markdown writes standard emoji
function MarkdownExportFormat(): JSX.Element {
  const {exportFormat} = useExtensionDependency(EmojiMdastExtension).output;
  const format = useExtensionSignalValue(EmojiMdastExtension, 'exportFormat');
  return (
    <div className={styles.options}>
      <label className={styles.option}>
        Export emoji as{' '}
        <select
          className={styles.input}
          onChange={event =>
            setOption(
              exportFormat,
              event.target.value === 'shortcode' ? 'shortcode' : 'unicode',
            )
          }
          value={format}>
          <option value="unicode">Unicode (👍), like Discord</option>
          <option value="shortcode">Shortcodes (:+1:), like Slack</option>
        </select>
      </label>
    </div>
  );
}

// The document as Markdown, kept up to date, and a box to import Markdown
function MarkdownPanel(): JSX.Element {
  const [editor] = useLexicalComposerContext();
  const [markdown, setMarkdown] = useState('');
  const [draft, setDraft] = useState<string | null>(null);
  const exportFormat = useExtensionSignalValue(
    EmojiMdastExtension,
    'exportFormat',
  );
  useEffect(() => {
    const exportDocument = () =>
      setMarkdown(editor.read(() => $convertToMarkdownString()));
    exportDocument();
    return editor.registerUpdateListener(exportDocument);
  }, [editor, exportFormat]);
  return (
    <details className={styles.markdown}>
      <summary>Markdown</summary>
      <MarkdownExportFormat />
      <textarea
        aria-label="Markdown"
        className={styles.markdownText}
        onChange={event => setDraft(event.target.value)}
        rows={6}
        value={draft ?? markdown}
      />
      <button
        className="button button--sm button--secondary"
        disabled={draft === null}
        onClick={() => {
          if (draft !== null) {
            editor.update(() => $convertFromMarkdownString(draft));
            setDraft(null);
          }
        }}
        type="button">
        Import
      </button>
    </details>
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
          <EmojiSetSelect />
          <FontControls />
          <UnicodeEmojiOption />
          <CustomEmojiForm />
        </div>
        <EmojiEditor />
        <MarkdownPanel />
      </LexicalExtensionComposer>
    </div>
  );
}
