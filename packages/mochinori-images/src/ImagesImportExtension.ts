import {
  CoreImportExtension,
  defineImportRule,
  DOMImportExtension,
  sel,
} from '@lexical/html';
import {
  $createParagraphNode,
  $isElementNode,
  $isLineBreakNode,
  configExtension,
  defineExtension,
  type LexicalNode,
} from 'lexical';

import {$createImageNode, type ImagePayload} from './ImageNode.tsx';
import {ImagesExtension} from './ImagesExtension.ts';

function parseDimension(value: string | null): number | undefined {
  const n = value === null ? NaN : Number.parseFloat(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function $imageFromElement(el: Element): ImagePayload | null {
  const src = el.getAttribute('src');
  // A local file path from a pasted document can never load in the editor
  if (!src || src.startsWith('file:///')) {
    return null;
  }
  return {
    altText: el.getAttribute('alt') || '',
    height: parseDimension(el.getAttribute('height')),
    src,
    width: parseDimension(el.getAttribute('width')),
  };
}

/** The inline content of `nodes`: a caption is one line of text */
function $flattenInline(nodes: LexicalNode[], output: LexicalNode[] = []) {
  for (const node of nodes) {
    if ($isLineBreakNode(node)) {
      continue;
    }
    if (node.isInline()) {
      output.push(node);
    } else if ($isElementNode(node)) {
      $flattenInline(node.getChildren(), output);
    }
  }
  return output;
}

/** Imports `<img>` as an inline {@link ImageNode} */
export const ImageImportRule = defineImportRule({
  $import: (_ctx, el, $next) => {
    const image = $imageFromElement(el);
    return image ? [$createImageNode(image)] : $next();
  },
  match: sel.tag('img'),
  name: '@mochinori/images/img',
});

/**
 * Imports a `<figure>` holding one `<img>` as a block {@link ImageNode},
 * with the text of its `<figcaption>`, if any, as the caption. Other figures
 * are left to the rules after this one.
 */
export const ImageFigureImportRule = defineImportRule({
  $import: (ctx, el, $next) => {
    const imgs = el.querySelectorAll('img');
    const payload = imgs.length === 1 ? $imageFromElement(imgs[0]) : null;
    if (payload === null) {
      return $next();
    }
    const image = $createImageNode({...payload, block: true});
    const figcaption = el.querySelector('figcaption');
    if (figcaption !== null) {
      const caption = $createParagraphNode();
      caption.append(...$flattenInline(ctx.$importChildren(figcaption)));
      image.setCaption(caption);
    }
    return [image];
  },
  match: sel.tag('figure'),
  name: '@mochinori/images/figure',
});

export const ImagesImportRules = [ImageFigureImportRule, ImageImportRule];

/**
 * Adds `<img>` and `<figure>` import to {@link DOMImportExtension}, for HTML paste and
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
