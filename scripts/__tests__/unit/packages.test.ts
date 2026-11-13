// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const PACKAGES_DIR = path.join(ROOT, 'packages');

interface PackageJson {
  name: string;
  private?: boolean;
  license?: string;
  type?: string;
  repository?: {directory?: string};
  exports?: Record<string, Record<string, string>>;
  files?: string[];
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

const packages = fs
  .readdirSync(PACKAGES_DIR)
  .filter(dir => fs.existsSync(path.join(PACKAGES_DIR, dir, 'package.json')))
  .map(dir => ({
    dir,
    pkg: JSON.parse(
      fs.readFileSync(path.join(PACKAGES_DIR, dir, 'package.json'), 'utf8'),
    ) as PackageJson,
  }));
const publicPackages = packages.filter(({pkg}) => !pkg.private);

// Lexical must be a singleton within an app, so a library built on it
// declares it as a peer, never as a dependency that could install a copy.
const isLexical = (name: string) =>
  name === 'lexical' || name.startsWith('@lexical/');
const SINGLETONS = (name: string) =>
  isLexical(name) || name === 'react' || name === 'react-dom';

describe('workspace packages', () => {
  it('has at least one public package', () => {
    expect(publicPackages.map(({pkg}) => pkg.name)).toContain(
      '@mochinori/images',
    );
  });

  it.each(packages)(
    '$pkg.name lives in a directory named after it',
    ({dir, pkg}) => {
      expect(dir).toBe(pkg.name.replace(/^@mochinori\//, 'mochinori-'));
    },
  );

  describe.each(publicPackages)('$pkg.name', ({dir, pkg}) => {
    it('is an MIT licensed ES module with the repository directory set', () => {
      expect(pkg.license).toBe('MIT');
      expect(pkg.type).toBe('module');
      expect(pkg.repository?.directory).toBe(`packages/${dir}`);
      expect(fs.existsSync(path.join(PACKAGES_DIR, dir, 'LICENSE'))).toBe(true);
    });

    it('exports its TypeScript source under the `mochinori-source` condition', () => {
      for (const [entry, conditions] of Object.entries(pkg.exports ?? {})) {
        expect(Object.keys(conditions)[0], entry).toBe('mochinori-source');
        expect(conditions['mochinori-source'], entry).toMatch(
          /^\.\/src\/.*\.tsx?$/,
        );
        expect(conditions.default, entry).toMatch(/^\.\/dist\/.*\.js$/);
      }
      expect(pkg.files).toContain('dist');
      // The release copies the root CHANGELOG.md into the package
      expect(pkg.files).toContain('CHANGELOG.md');
    });

    it('declares Lexical and React as peer dependencies only', () => {
      const deps = Object.keys(pkg.dependencies ?? {});
      expect(deps.filter(SINGLETONS)).toEqual([]);
      for (const name of Object.keys(pkg.peerDependencies ?? {})) {
        if (isLexical(name)) {
          // The workspace develops and tests against the catalog version
          expect(pkg.devDependencies?.[name], name).toBe('catalog:');
        }
      }
    });
  });
});
