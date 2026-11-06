// @vitest-environment node

import {describe, expect, it} from 'vitest';

import {
  createEmojiMatcher,
  findEmoji,
  parseEmojiShortNames,
  parseEmojiTexts,
} from '../../index.ts';

describe('findEmoji', () => {
  it('can easily be used to replace the short code', () => {
    const input = 'handles :) mid-string';
    const result = findEmoji(input)!;
    expect(
      [
        input.slice(0, result.position),
        result.emoji,
        input.slice(result.position + result.shortcode.length),
      ].join(''),
    ).toEqual('handles 🙂 mid-string');
  });
  Object.entries({
    ':flag-it:': {emoji: '🇮🇹', position: 0, shortcode: ':flag-it:'},
    ':it:': {emoji: '🇮🇹', position: 0, shortcode: ':it:'},
    ':it:adjacent': {emoji: '🇮🇹', position: 0, shortcode: ':it:'},
    'adjacent:it:': {
      emoji: '🇮🇹',
      position: 'adjacent'.length,
      shortcode: ':it:',
    },
    'finds emojis at the end :man-facepalming:': {
      emoji: '🤦‍♂️',
      position: 'finds emojis at the end '.length,
      shortcode: ':man-facepalming:',
    },
    'handles :) mid-string': {
      emoji: '🙂',
      position: 'handles '.length,
      shortcode: ':)',
    },
    'handles smileys right after an emoji 😀:) ok': {
      emoji: '🙂',
      position: 'handles smileys right after an emoji 😀'.length,
      shortcode: ':)',
    },
    'ignores smileys at the end :)': null,
    'ignores smileys right after a letter x:) ok': null,
  }).forEach(([k, v]) => {
    it(`${k} -> ${v ? v.shortcode : 'not found'}`, () =>
      expect(findEmoji(k)).toEqual(v));
  });
});

describe('createEmojiMatcher', () => {
  it('only matches what the parser returns', () => {
    const shortNames = createEmojiMatcher(parseEmojiShortNames);
    expect(shortNames('a :) b')).toBe(null);
    expect(shortNames('a :smile: b')?.emoji).toBe('😄');
    const texts = createEmojiMatcher(parseEmojiTexts);
    expect(texts('a :smile: b')).toBe(null);
    expect(texts('a :) b')?.emoji).toBe('🙂');
  });

  it('matches custom emoji by :name:, after standard emoji', () => {
    const parrot = {name: 'partyparrot', src: 'parrot.gif'};
    const smile = {name: 'smile', src: 'smile.png'};
    const matcher = createEmojiMatcher(
      parseEmojiShortNames,
      new Map([
        [parrot.name, parrot],
        [smile.name, smile],
      ]),
    );
    expect(matcher('so :partyparrot:')).toEqual({
      custom: parrot,
      emoji: ':partyparrot:',
      position: 3,
      shortcode: ':partyparrot:',
    });
    expect(matcher(':smile:')).toEqual({
      emoji: '😄',
      position: 0,
      shortcode: ':smile:',
    });
    expect(matcher('partyparrot')).toBe(null);
  });

  it('returns the same matcher for the same parser', () => {
    expect(createEmojiMatcher(parseEmojiTexts)).toBe(
      createEmojiMatcher(parseEmojiTexts),
    );
  });
});
