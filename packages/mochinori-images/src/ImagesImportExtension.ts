import {
  CoreImportExtension,
  defineImportRule,
  DOMImportExtension,
  sel,
} from '@lexical/html';
import {configExtension, defineExtension} from 'lexical';

import {$createImageNode} from './ImageNode.tsx';
import {ImagesExtension} from './ImagesExtension.ts';

function parseDimension(value: string | null): number | undefined {
  const n = value === null ? NaN : Number.parseFloat(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Imports `<img>` as an {@link ImageNode} */
export const ImageImportRule = defineImportRule({
  $import: (_ctx, el, $next) => {
    const src = el.getAttribute('src');
    // A local file path from a pasted document can never load in the editor
    if (!src || src.startsWith('file:///')) {
      return $next();
    }
    return [
      $createImageNode({
        altText: el.getAttribute('alt') || '',
        height: parseDimension(el.getAttribute('height')),
        src,
        width: parseDimension(el.getAttribute('width')),
      }),
    ];
  },
  match: sel.tag('img'),
  name: '@mochinori/images/img',
});

export const ImagesImportRules = [ImageImportRule];

/**
 * Adds `<img>` import to {@link DOMImportExtension}, for HTML paste and
 * `$generateNodesFromDOM`. Images are not imported through the legacy
 * `importDOM` path.
 */
export const ImagesImportExtension = defineExtension({
  dependencies: [
    ImagesExtension,
    CoreImportExtension,
    configExtension(DOMImportExtension, {rules: ImagesImportRules}),
  ],
  name: '@mochinori/images/ImagesImport',
});
