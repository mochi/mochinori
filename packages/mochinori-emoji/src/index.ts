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
} from './EmojiExtension.ts';
export {
  EmojiImportExtension,
  EmojiImportRule,
  EmojiImportRules,
} from './EmojiImportExtension.ts';
export {
  $createEmojiNode,
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
export {textFromUnifiedID, unifiedIDFromText} from './unifiedID.ts';
