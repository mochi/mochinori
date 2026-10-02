// @vitest-environment node

import {RuleTester} from 'eslint';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import tseslint from 'typescript-eslint';
import {afterAll, describe, it} from 'vitest';

import rule from '../../rules/no-imports-from-self.js';

// RuleTester registers its cases with whatever test framework it is given
Object.assign(RuleTester, {afterAll, describe, it});

const packagesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);
// A file inside a public package (@mochinori/images)
const publicFile = path.join(packagesDir, 'mochinori-images/src/Example.ts');
// A file inside a private package (this plugin)
const privateFile = path.join(
  packagesDir,
  'mochinori-eslint-plugin-internal/src/Example.ts',
);

new RuleTester({
  languageOptions: {parser: tseslint.parser},
}).run('no-imports-from-self', rule, {
  invalid: [
    {
      code: "import {ImageNode} from '@mochinori/images';",
      errors: [{messageId: 'selfImport'}],
      filename: publicFile,
    },
    {
      code: "import {ImageNode} from '@mochinori/images/ImageNode';",
      errors: [{messageId: 'selfImport'}],
      filename: publicFile,
    },
  ],
  valid: [
    {
      code: "import {ImageNode} from './ImageNode';",
      filename: publicFile,
    },
    {
      code: "import type {ImageNode} from '@mochinori/images';",
      filename: publicFile,
    },
    {
      code: "import {$getRoot} from 'lexical';",
      filename: publicFile,
    },
    {
      code: "import plugin from '@mochinori/eslint-plugin-internal';",
      filename: privateFile,
    },
  ],
});
