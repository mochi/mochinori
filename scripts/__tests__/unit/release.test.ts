// @vitest-environment node

import {describe, expect, it} from 'vitest';

import {previewVersion} from '../../release/preview-version.ts';
import {bumpVersion} from '../../release/version.ts';

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

describe('previewVersion', () => {
  it('puts main and pull request previews after the current release', () => {
    expect(previewVersion('0.1.0', {sha: '4282A68f00'})).toBe(
      '0.1.1-main.g4282a68',
    );
    expect(previewVersion('0.1.0', {pr: '21', sha: '0123456'})).toBe(
      '0.1.1-pr.21.g0123456',
    );
  });

  it('refuses a malformed commit or pull request number', () => {
    expect(() => previewVersion('0.1.0', {sha: 'main'})).toThrow(/--sha/);
    expect(() => previewVersion('0.1.0', {pr: '0', sha: '0123456'})).toThrow(
      /--pr/,
    );
  });
});
