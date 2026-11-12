// @vitest-environment node

import {describe, expect, it} from 'vitest';

import {bumpVersion} from '../../release/version.mjs';

describe('bumpVersion', () => {
  it('starts at 0.1.0 whichever increment is asked for', () => {
    expect(bumpVersion('0.0.0', 'patch')).toBe('0.1.0');
    expect(bumpVersion('0.0.0', 'minor')).toBe('0.1.0');
  });

  it('bumps the patch or the minor', () => {
    expect(bumpVersion('0.1.0', 'patch')).toBe('0.1.1');
    expect(bumpVersion('0.1.4', 'minor')).toBe('0.2.0');
  });

  it('refuses a prerelease or malformed version', () => {
    expect(() => bumpVersion('0.2.0-next.1', 'patch')).toThrow(/Cannot bump/);
  });
});
