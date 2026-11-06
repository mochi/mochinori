// @vitest-environment node

import {describe, expect, it} from 'vitest';

import {textFromUnifiedID, unifiedIDFromText} from '../../index.ts';

const TEST_MAP = {
  '1F415-200D-1F9BA': '🐕‍🦺',
  '1F60A': '😊',
  '1F926-200D-2642-FE0F': '🤦‍♂️',
};
describe('unifiedIDFromText', () => {
  Object.entries(TEST_MAP).forEach(([k, v]) =>
    it(`${v} -> ${k}`, () =>
      expect(unifiedIDFromText(v).toUpperCase()).toEqual(k)),
  );
});
describe('textFromUnifiedID', () => {
  Object.entries(TEST_MAP).forEach(([k, v]) =>
    it(`${k} -> ${v}`, () => expect(textFromUnifiedID(k)).toEqual(v)),
  );
});
