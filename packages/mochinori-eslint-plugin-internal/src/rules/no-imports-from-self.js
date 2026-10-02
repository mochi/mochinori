import fs from 'node:fs';
import path from 'node:path';

/**
 * @typedef {{name: string, private: boolean}} PackageInfo
 */

/** @type {Map<string, PackageInfo | null>} */
const packageCache = new Map();

/**
 * Find the package.json that owns `startDir`, caching by directory.
 *
 * @param {string} startDir
 * @returns {PackageInfo | null}
 */
function getOwningPackage(startDir) {
  /** @type {string[]} */
  const visited = [];
  /** @type {PackageInfo | null} */
  let result = null;
  let dir = startDir;
  for (;;) {
    const cached = packageCache.get(dir);
    if (cached !== undefined) {
      result = cached;
      break;
    }
    visited.push(dir);
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const json = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      result =
        typeof json.name === 'string'
          ? {name: json.name, private: json.private === true}
          : null;
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  for (const visitedDir of visited) {
    packageCache.set(visitedDir, result);
  }
  return result;
}

/**
 * A published package must not import itself by name: the import resolves
 * through `exports` to the built output (or a second copy of the module)
 * instead of the sibling source file. Type-only imports are erased, so they
 * are allowed.
 *
 * @type {import('eslint').Rule.RuleModule}
 */
const rule = {
  create(context) {
    const pkg = getOwningPackage(path.dirname(context.filename));
    if (!pkg || pkg.private) {
      return {};
    }
    return {
      ImportDeclaration(node) {
        if (/** @type {{importKind?: string}} */ (node).importKind === 'type') {
          return;
        }
        const source = node.source.value;
        if (
          typeof source === 'string' &&
          (source === pkg.name || source.startsWith(`${pkg.name}/`))
        ) {
          context.report({
            data: {moduleName: source},
            messageId: 'selfImport',
            node,
          });
        }
      },
    };
  },
  meta: {
    docs: {
      description:
        'Disallow a package from importing itself by name, except type-only imports',
    },
    messages: {
      selfImport:
        "Package should not import from itself ('{{moduleName}}'). Use a relative import instead.",
    },
    schema: [],
    type: 'problem',
  },
};

export default rule;
