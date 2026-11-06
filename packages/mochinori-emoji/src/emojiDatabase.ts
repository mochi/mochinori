// What `#loadEmojiDatabase` loads: everything that needs the emoji database,
// which browsers load as a separate chunk the first time an editor needs it
export {createEmojiTextSplitter} from './$splitEmojiText.ts';
export {createTextNodeTransform} from './$textNodeTransform.ts';
export {getEmojiCategories, searchEmoji} from './searchEmoji.ts';
