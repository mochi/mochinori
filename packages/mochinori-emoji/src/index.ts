export {type CustomEmoji, type CustomEmojiMap} from './customEmoji.ts';
export {
  type EmojiEntry,
  type EmojiEntryParser,
  type MatchEmojiPair,
  parseEmojiShortNames,
  parseEmojiShortNamesAndTexts,
  parseEmojiTexts,
} from './emojiEntries.ts';
export {
  EMOJI_DATASOURCE_VERSION,
  EmojiExtension,
  type EmojiExtensionConfig,
  type EmojiExtensionOutput,
} from './EmojiExtension.ts';
export {
  CustomEmojiImportRule,
  EmojiImportExtension,
  EmojiImportRule,
  EmojiImportRules,
} from './EmojiImportExtension.ts';
export {
  $createCustomEmojiNode,
  $createEmojiNode,
  $isCustomEmojiNode,
  $isEmojiNode,
  EmojiNode,
  type SerializedEmojiNode,
} from './EmojiNode.ts';
export {
  createEmojiMatcher,
  type EmojiMatch,
  type EmojiMatcher,
  findEmoji,
} from './findEmoji.ts';
export {type CustomEmojiLookup} from './registerCustomEmojiLookup.ts';
export {textFromUnifiedID, unifiedIDFromText} from './unifiedID.ts';
