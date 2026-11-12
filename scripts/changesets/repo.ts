/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Filesystem and git access for the changeset scripts: workspace packages,
 * pending changesets, and the pull request each changeset came from.
 * Uses only Node built-ins so CI can run it before `pnpm install`.
 */

import type {Entry, ValidationContext} from './entry.ts';

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {parseChangesetFile, parseEntry} from './entry.ts';

export const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

export interface WorkspacePackage {
  /** npm name */
  name: string;
  /** repo-relative directory, e.g. `packages/mochinori-images` */
  dir: string;
  isPrivate: boolean;
  version: string;
}

/**
 * Every package under `packages/` (the pnpm workspace).
 */
export function readPackages(root: string): WorkspacePackage[] {
  const out: WorkspacePackage[] = [];
  for (const parent of ['packages']) {
    const abs = path.join(root, parent);
    if (!fs.existsSync(abs)) {
      continue;
    }
    for (const name of fs.readdirSync(abs).sort()) {
      const manifest = path.join(abs, name, 'package.json');
      if (!fs.existsSync(manifest)) {
        continue;
      }
      const json = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      if (typeof json.name !== 'string') {
        continue;
      }
      out.push({
        dir: `${parent}/${name}`,
        isPrivate: json.private === true,
        name: json.name,
        version: String(json.version || ''),
      });
    }
  }
  return out;
}

/**
 * The packages under `packages/` at a git revision.
 */
export function readPackagesAt(root: string, rev: string): WorkspacePackage[] {
  const out: WorkspacePackage[] = [];
  const dirs = tryGit(root, ['ls-tree', '--name-only', rev, 'packages/'])
    .split('\n')
    .filter(Boolean);
  for (const dir of dirs) {
    const text = tryGit(root, ['show', `${rev}:${dir}/package.json`]);
    if (text === '') {
      continue;
    }
    try {
      const json = JSON.parse(text);
      if (typeof json.name === 'string') {
        out.push({
          dir,
          isPrivate: json.private === true,
          name: json.name,
          version: String(json.version || ''),
        });
      }
    } catch {
      // Not a package.
    }
  }
  return out;
}
export function validationContext(
  packages: WorkspacePackage[],
): ValidationContext {
  return {
    allPackages: new Set(packages.map(p => p.name)),
    publicPackages: new Set(
      packages.filter(p => !p.isPrivate).map(p => p.name),
    ),
  };
}

/**
 * Is `file` (a name inside `.changeset/`) a changeset?
 */
export function isChangesetFile(file: string): boolean {
  return file.endsWith('.md') && file.toLowerCase() !== 'readme.md';
}

export interface PendingChangeset {
  /** path relative to the repo root */
  file: string;
  contents: string;
  releases: Record<string, string>;
  entry: Entry;
}

/**
 * @param dir absolute path of the changeset directory
 */
export function readPending(
  dir: string,
  root: string = ROOT,
): PendingChangeset[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir)
    .filter(isChangesetFile)
    .sort()
    .map(name => {
      const abs = path.join(dir, name);
      const contents = fs.readFileSync(abs, 'utf8');
      const parsed = parseChangesetFile(contents);
      return {
        contents,
        entry: parseEntry(parsed ? parsed.body : ''),
        file: path.relative(root, abs).split(path.sep).join('/'),
        releases: parsed ? parsed.releases : {},
      };
    });
}
export function git(root: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/**
 * True when the module at `metaUrl` is the script node was asked to run,
 * also when it was started through a symlink.
 *
 * @param metaUrl `import.meta.url` of the calling module
 */
export function isMain(metaUrl: string): boolean {
  if (!process.argv[1]) {
    return false;
  }
  try {
    return (
      fs.realpathSync(process.argv[1]) ===
      fs.realpathSync(fileURLToPath(metaUrl))
    );
  } catch {
    return false;
  }
}

/** The GitHub repository the release links point at. */
export const GITHUB_REPOSITORY =
  process.env.GITHUB_REPOSITORY || 'mochi/mochinori';

const BOT_RE =
  /\[bot\]$|^(?:dependabot|renovate|github-actions)\b|GitHub Actions Bot/i;

/**
 * @param who a GitHub login or git author name
 */
export function isBot(who: string | null | undefined): boolean {
  return who != null && BOT_RE.test(who);
}

export interface Origin {
  pr: number | null;
  /** `@login` when known, else the git author name */
  author: string | null;
}

export interface OriginOptions {
  /** from a `PR: #123` line */
  prOverride?: number | null;
  /** GitHub token; enables the API fallbacks */
  token?: string;
  fetchImpl?: typeof fetch;
  /** `owner/name` */
  repository?: string;
}
function tryGit(root: string, args: string[]): string {
  try {
    return git(root, args).trim();
  } catch {
    return '';
  }
}

/** The fields of a GitHub pull request that the release reads. */
interface GitHubPull {
  number: number;
  merged_at: string | null;
  user: {login: string} | null;
}

/**
 * @param route e.g. `pulls/123`
 */
async function githubApi<T>(
  options: OriginOptions,
  route: string,
): Promise<T | null> {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const repository = options.repository || GITHUB_REPOSITORY;
  try {
    const res = await fetchImpl(
      `https://api.github.com/repos/${repository}/${route}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${options.token}`,
        },
      },
    );
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/**
 * The commit that added `file`, following renames inside its directory
 * (not copies: `git log --follow` would also follow a copy, and two
 * changesets often have similar text).
 *
 * @param file repo-relative path
 * @returns `[sha, author name, subject]`, or `[]`
 */
function addingCommit(root: string, file: string): string[] {
  const dir = path.posix.dirname(file);
  const log = tryGit(root, [
    'log',
    '-M',
    '--diff-filter=AR',
    '--name-status',
    '--format=%x01%H%x00%an%x00%s',
    '--',
    dir === '.' ? file : dir,
  ]);
  let name = file;
  for (const record of log.split('\x01').filter(Boolean)) {
    const [header, ...changes] = record.split('\n');
    for (const change of changes) {
      const [status = '', a, b] = change.split('\t');
      if (status === 'A' && a === name) {
        return header.split('\0');
      }
      if (status.startsWith('R') && b === name && a !== undefined) {
        name = a;
      }
    }
  }
  return [];
}

/**
 * The pull request and author behind a changeset, in order of preference:
 *
 * 1. a `PR: #123` line in the changeset (for changesets added later);
 * 2. the `(#123)` that GitHub squash merges append to the subject of the
 *    commit that added the file (following renames, not copies);
 * 3. the first-parent `Merge pull request #123` that brought that commit
 *    into the branch;
 * 4. with a GitHub token, the pull requests GitHub associates with the
 *    commit.
 *
 * The author is the pull request's GitHub login when a token is available,
 * else the commit's author name. Bots are dropped.
 *
 * @param file repo-relative path
 */
export async function resolveOrigin(
  root: string,
  file: string,
  options: OriginOptions = {},
): Promise<Origin> {
  const [sha = '', authorName = '', subject = ''] = addingCommit(root, file);
  let pr: number | null = options.prOverride ?? null;
  if (pr === null) {
    const m = /\(#(\d+)\)\s*$/.exec(subject);
    pr = m ? Number(m[1]) : null;
  }
  if (pr === null && sha) {
    const merges = tryGit(root, [
      'log',
      '--ancestry-path',
      '--first-parent',
      '--merges',
      '--reverse',
      '--format=%s',
      `${sha}..HEAD`,
    ]);
    const m = /^Merge pull request #(\d+)/m.exec(merges);
    pr = m ? Number(m[1]) : null;
  }
  let login: string | null = null;
  if (options.token) {
    if (pr === null && sha) {
      const pulls = await githubApi<GitHubPull[]>(
        options,
        `commits/${sha}/pulls`,
      );
      if (Array.isArray(pulls) && pulls.length > 0) {
        const merged = pulls.find(p => p.merged_at) || pulls[0];
        pr = merged.number;
        login = merged.user ? merged.user.login : null;
      }
    }
    if (pr !== null && login === null) {
      const pull = await githubApi<GitHubPull>(options, `pulls/${pr}`);
      login = pull && pull.user ? pull.user.login : null;
    }
  }
  const author = login
    ? isBot(login)
      ? null
      : `@${login}`
    : authorName && !isBot(authorName) && options.prOverride == null
      ? authorName
      : null;
  return {author, pr};
}
