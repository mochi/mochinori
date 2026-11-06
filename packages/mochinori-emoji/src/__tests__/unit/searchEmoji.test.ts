// @vitest-environment node

import {describe, expect, it} from 'vitest';

import {searchEmoji} from '../../searchEmoji.ts';

const names = (query: string, options?: Parameters<typeof searchEmoji>[1]) =>
  searchEmoji(query, options).map(s => s.name);

describe('searchEmoji', () => {
  it('ranks exact, prefix, word and substring matches in that order', () => {
    expect(names('app')).toEqual([
      'apple',
      'green_apple',
      'clapper',
      'pineapple',
      'disappointed',
      'snow_capped_mountain',
      'disappointed_relieved',
    ]);
    expect(names('smile').slice(0, 2)).toEqual(['smile', 'smiley']);
  });

  it('returns each emoji once, with the emoji', () => {
    const [thumbsUp, ...rest] = searchEmoji('+1');
    expect(thumbsUp).toEqual({emoji: '👍', name: '+1'});
    expect(rest.map(s => s.emoji)).not.toContain('👍');
    const found = searchEmoji('thumbs', {limit: 50});
    expect(new Set(found.map(s => s.emoji)).size).toBe(found.length);
  });

  it('ignores case and stops at the limit', () => {
    expect(names('APPLE')[0]).toBe('apple');
    expect(searchEmoji('a', {limit: 3})).toHaveLength(3);
    expect(searchEmoji('', {limit: 2})).toHaveLength(2);
    expect(searchEmoji('no-such-emoji-name')).toEqual([]);
  });

  it('searches custom emoji too', () => {
    const parrot = {name: 'partyparrot', src: 'parrot.gif'};
    const apple = {name: 'apple', src: 'apple.png'};
    expect(searchEmoji('partyp', {customEmoji: [parrot]})).toEqual([
      {custom: parrot, name: 'partyparrot'},
    ]);
    // Both show when a custom emoji has a standard emoji's name, and custom
    // emoji come first among names that match as well
    expect(
      searchEmoji('apple', {customEmoji: [apple]}).map(
        s => s.custom ?? s.emoji,
      ),
    ).toEqual([apple, '🍎', '🍏', '🍍']);
    expect(
      names('mo', {customEmoji: [parrot, {name: 'mochi', src: 'mochi.png'}]}),
    ).toContain('mochi');
    expect(
      names('mo', {customEmoji: [{name: 'mochi', src: 'mochi.png'}]})[0],
    ).toBe('mochi');
  });
});
