// @vitest-environment node

import {buildEditorFromExtensions} from '@lexical/extension';
import {nodeArbitrary} from '@lexical/fast-check';
import * as fc from 'fast-check';
import {
  $create,
  $createParagraphNode,
  $getNodeByKey,
  $getRoot,
  type Klass,
  type LexicalExportJSON,
  type LexicalNode,
  type LexicalParseJSON,
  type NodeKey,
} from 'lexical';
import {describe, expect, it} from 'vitest';

import {EmojiExtension, EmojiNode} from '../../index.ts';

/**
 * Sets generated properties on a node, then checks that they survive a
 * clone by a later update and both JSON forms. `nodeArbitrary` draws the
 * properties from the node's own schema, so they are mostly not the
 * defaults a hand-written fixture would use (and a dropped property compares
 * equal to its default).
 */
function expectSchemaRoundTrips<T extends LexicalNode>(
  klass: Klass<T>,
  props: LexicalParseJSON<LexicalExportJSON<T>>,
) {
  using editor = buildEditorFromExtensions({
    dependencies: [EmojiExtension],
    name: '[root]',
  });
  let key: NodeKey = '';
  let original: LexicalNode | null = null;
  editor.update(
    () => {
      const node = $create(klass);
      $getRoot().clear().append($createParagraphNode().append(node));
      node.updateFromJSON(props);
      key = node.getKey();
      original = node;
    },
    {discrete: true},
  );
  const before = editor.read(() => $getNodeByKey(key)!.exportJSON());
  editor.update(
    () => {
      const writable = $getNodeByKey(key)!.getWritable();
      expect(writable).not.toBe(original);
      expect(writable.exportJSON()).toEqual(before);
      // Through a string, as stored documents are (which also writes a
      // generated -0 as 0)
      const viaString = (json: unknown) => JSON.parse(JSON.stringify(json));
      for (const compact of [false, true]) {
        const json = viaString(writable.exportJSON(compact));
        expect(
          viaString($create(klass).updateFromJSON(json).exportJSON()),
        ).toEqual(viaString(before));
      }
    },
    {discrete: true},
  );
}

describe('the serialization schemas', () => {
  it('EmojiNode', () => {
    fc.assert(
      fc.property(nodeArbitrary(EmojiNode), props => {
        // An empty TextNode is removed between the two updates
        expectSchemaRoundTrips(EmojiNode, {...props, text: '🙂'});
      }),
    );
  });
});
