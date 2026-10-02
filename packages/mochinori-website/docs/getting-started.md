---
sidebar_position: 2
---

# Getting started

mochinori packages are ordinary npm packages. Install the one you need along
with Lexical itself:

```sh
npm install @mochinori/images lexical @lexical/extension @lexical/react @lexical/rich-text
```

Then add its extension to your editor:

```tsx
import {LexicalExtensionComposer} from '@lexical/react/LexicalExtensionComposer';
import {ContentEditable} from '@lexical/react/LexicalContentEditable';
import {RichTextExtension} from '@lexical/rich-text';
import {ImagesExtension} from '@mochinori/images';
import {defineExtension} from 'lexical';

const EditorExtension = defineExtension({
  dependencies: [RichTextExtension, ImagesExtension],
  name: '@my-app/Editor',
});

export function Editor() {
  return (
    <LexicalExtensionComposer extension={EditorExtension} contentEditable={null}>
      <ContentEditable aria-label="Editor" />
    </LexicalExtensionComposer>
  );
}
```

## One Lexical per app

Lexical must be a singleton within an application: two copies of `lexical`
break node registration, commands and the active editor. mochinori packages
list Lexical in `peerDependencies`, so your app decides the version. Keep
`lexical` and every `@lexical/*` package on the same exact version.
