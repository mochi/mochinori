/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Render and parse CHANGELOG.md.
 *
 * A version block looks like:
 *
 *   ## v0.53.0 (2026-10-30)
 *
 *   ### Breaking changes
 *
 *   - **@mochinori/emoji, @mochinori/images**: Summary ([#21](https://github.com/mochi/mochinori/pull/21))
 *
 *     Migration: ...
 *
 *   ### Fixes
 *   ...
 *   ### Contributors
 *
 *   @someone, Some Name
 *
 * The `## vX.Y.Z (date)` heading shape is what Renovate and Dependabot use
 * to slice release notes out of the file, so it must not change.
 */

import type {Category, ReleaseEntry} from './entry.ts';

import {
  CATEGORIES,
  isBehaviorChange,
  normalizeCategory,
  parseSections as parseLabeledSections,
  renderEntry,
  REPO_URL,
} from './entry.ts';

export interface Commit {
  subject: string;
  author: string;
}

const RELEASE_COMMIT_RE = /^v\d+\.\d+\.\d+(?:-\S+)?(?:\s+\(#\d+\))?$/;

/**
 * Is this the version bump commit of a release (`v0.52.0`, `v0.52.0 (#9252)`)?
 */
export function isReleaseCommit(subject: string): boolean {
  return RELEASE_COMMIT_RE.test(subject.trim());
}

/**
 * The `### All changes` list: every commit subject as written, with its
 * pull request linked. A safety net under the curated sections.
 *
 * @param commits newest first
 */
export function renderAllChanges(commits: Commit[]): string {
  return commits
    .filter(c => !isReleaseCommit(c.subject))
    .map(c => {
      const m = /^(.*?)\s*\(#(\d+)\)\s*$/.exec(c.subject);
      const subject = (m ? m[1] : c.subject)
        .replace(/\\/g, '\\\\')
        .replace(/</g, '\\<');
      const pr = m ? ` ([#${m[2]}](${REPO_URL}/pull/${m[2]}))` : '';
      const author = c.author ? ` ${c.author}` : '';
      return `- ${subject}${pr}${author}`;
    })
    .join('\n');
}

/**
 * @returns markdown, ending with a newline
 */
export function renderVersionBlock({
  version,
  date,
  entries,
  commits = [],
  heading,
  intro,
}: {
  version: string;
  date: string;
  entries: ReleaseEntry[];
  commits?: Commit[];
  heading?: string;
  intro?: string;
}): string {
  const parts = [heading || `## v${version.replace(/^v/, '')} (${date})`];
  if (intro) {
    parts.push(intro);
  }
  // A non-breaking entry with a `Verify:` paragraph changes observable
  // behavior or output, so it is listed under "Behavior changes", right
  // after the breaking changes, instead of under its own category.
  const behavior = entries.filter(isBehaviorChange);
  const sections = [
    {
      items: entries.filter(e => e.category === 'breaking'),
      title: 'Breaking changes',
    },
    {items: behavior, title: 'Behavior changes'},
    ...CATEGORIES.filter(c => c.key !== 'breaking').map(({key, title}) => ({
      items: entries.filter(e => e.category === key && !behavior.includes(e)),
      title,
    })),
  ];
  for (const {items, title} of sections) {
    if (items.length > 0) {
      parts.push(`### ${title}`);
      parts.push(items.map(renderEntry).join('\n\n'));
    }
  }
  const allChanges = renderAllChanges(commits);
  if (entries.length === 0) {
    parts.push(
      allChanges === ''
        ? 'No user-facing changes were recorded for this release.'
        : 'No changesets were recorded for this release; see the commits below.',
    );
  }
  const contributors: string[] = [];
  for (const entry of entries) {
    for (const who of entry.contributors) {
      if (!contributors.includes(who)) {
        contributors.push(who);
      }
    }
  }
  if (contributors.length > 0) {
    parts.push('### Contributors');
    parts.push(contributors.join(', '));
  }
  if (allChanges !== '') {
    parts.push('### All changes');
    parts.push(allChanges);
  }
  return parts.join('\n\n') + '\n';
}

/**
 * Insert a version block above the newest existing version, keeping any
 * preamble that precedes it.
 */
export function insertVersionBlock(changelog: string, block: string): string {
  const match = /^## /m.exec(changelog);
  if (!match) {
    const sep = changelog.trim() === '' ? '' : '\n';
    return `${changelog.replace(/\s*$/, sep ? '\n' : '')}${sep}${block}`;
  }
  const head = changelog.slice(0, match.index);
  const tail = changelog.slice(match.index);
  return `${head}${block.replace(/\n*$/, '\n\n')}${tail}`;
}

export interface ParsedEntry {
  /** the bullet as written, continuation lines unindented */
  text: string;
  /** npm names from a leading `**a, b**:` */
  packages: string[];
  /** the bullet's first line without packages or PR */
  summary: string;
  pr: number | null;
  /** the bullet's body after the first line */
  details: string;
  /** labeled sections */
  sections: Partial<Record<string, string>>;
}

export interface ParsedSection {
  /** the heading as written ('' for an untitled block) */
  title: string;
  kind: Category | 'behavior' | 'all' | 'contributors' | 'other';
  /** the section body as written */
  body: string;
  entries: ParsedEntry[];
}

export interface ParsedVersion {
  /** without a leading `v` */
  version: string;
  /** as written in the heading */
  date: string;
  /** the full heading line */
  heading: string;
  /** everything under the heading, verbatim */
  body: string;
  sections: ParsedSection[];
}

const SECTION_KINDS: Readonly<Record<string, ParsedSection['kind']>> = {
  'all changes': 'all',
  'behavior changes': 'behavior',
  'breaking changes': 'breaking',
  contributors: 'contributors',
  deprecations: 'deprecation',
  documentation: 'docs',
  features: 'feature',
  fixes: 'fix',
  'major changes': 'breaking',
  other: 'chore',
  'other changes': 'chore',
  performance: 'perf',
};
function sectionKind(title: string): ParsedSection['kind'] {
  const key = title.trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(SECTION_KINDS, key)) {
    return SECTION_KINDS[key];
  }
  return normalizeCategory(key) || 'other';
}

/**
 * Parse CHANGELOG.md into versions, sections and entries. Older blocks
 * that have no `###` headings parse as a single `all` section.
 */
export function parseChangelog(markdown: string): ParsedVersion[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const versions: ParsedVersion[] = [];
  let current: {
    heading: string;
    version: string;
    date: string;
    lines: string[];
  } | null = null;
  const flush = () => {
    if (current) {
      const body = trimBlank(current.lines).join('\n');
      versions.push({
        body,
        date: current.date,
        heading: current.heading,
        sections: parseSections(body),
        version: current.version,
      });
    }
  };
  let inFence = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
    }
    const m = inFence
      ? null
      : /^## v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\s*(?:\((.*)\))?\s*$/.exec(
          line,
        );
    if (m) {
      flush();
      current = {date: m[2] || '', heading: line, lines: [], version: m[1]};
    } else if (current) {
      current.lines.push(line);
    }
  }
  flush();
  return versions;
}
function trimBlank(lines: string[]): string[] {
  const out = [...lines];
  while (out.length && out[0].trim() === '') {
    out.shift();
  }
  while (out.length && out[out.length - 1].trim() === '') {
    out.pop();
  }
  return out;
}
function parseSections(body: string): ParsedSection[] {
  const sections: ParsedSection[] = [];
  let current: {title: string; lines: string[]} = {lines: [], title: ''};
  const flush = () => {
    const text = trimBlank(current.lines).join('\n');
    if (current.title !== '' || text !== '') {
      const kind = current.title === '' ? 'all' : sectionKind(current.title);
      sections.push({
        body: text,
        entries: kind === 'contributors' ? [] : parseEntries(text),
        kind,
        title: current.title,
      });
    }
  };
  let inFence = false;
  for (const line of body.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
    }
    const m = inFence ? null : /^### (.+?)\s*$/.exec(line);
    if (m) {
      flush();
      current = {lines: [], title: m[1]};
    } else {
      current.lines.push(line);
    }
  }
  flush();
  return sections;
}

const PACKAGES_PREFIX_RE = /^\*\*([^*]+)\*\*:\s*/;
const PR_RE = /\s*\((?:\[#(\d+)\]\([^)]*\)|#(\d+))\)/g;

/**
 * Split a bullet's first line into packages, summary and PR number.
 */
export function parseEntryHead(line: string): {
  packages: string[];
  summary: string;
  pr: number | null;
} {
  let rest = line;
  let packages: string[] = [];
  const pm = PACKAGES_PREFIX_RE.exec(rest);
  if (pm) {
    packages = pm[1].split(',').map(s => s.trim());
    rest = rest.slice(pm[0].length);
  }
  let last: RegExpExecArray | null = null;
  for (const m of rest.matchAll(PR_RE)) {
    last = m;
  }
  if (last === null || last.index === undefined) {
    return {packages, pr: null, summary: rest.trim()};
  }
  const summary =
    rest.slice(0, last.index) + rest.slice(last.index + last[0].length);
  return {
    packages,
    pr: Number(last[1] || last[2]),
    summary: summary.replace(/\s+/g, ' ').trim(),
  };
}

/**
 * Split a section body into top-level bullets. A bullet continues over
 * indented lines and blank lines that are followed by indented lines.
 */
function parseEntries(body: string): ParsedEntry[] {
  const lines = body.split('\n');
  const bullets: string[][] = [];
  let current: string[] | null = null;
  for (const line of lines) {
    if (/^[-*] /.test(line)) {
      current = [line.slice(2)];
      bullets.push(current);
    } else if (current && (line.trim() === '' || /^ {2,}\S/.test(line))) {
      current.push(line.replace(/^ {2}/, ''));
    } else if (line.trim() !== '') {
      // Free text outside a bullet ends the current bullet.
      current = null;
    }
  }
  return bullets.map(bullet => {
    const [first, ...rest] = trimBlank(bullet);
    const head = parseEntryHead(first || '');
    const details = trimBlank(rest).join('\n');
    return {
      details,
      packages: head.packages,
      pr: head.pr,
      sections: parseLabeledSections(details),
      summary: head.summary,
      text: trimBlank(bullet).join('\n'),
    };
  });
}

export const VERSION_RE = /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
export function isVersion(version: string): boolean {
  return VERSION_RE.test(version);
}

/**
 * Compare two semver strings with semver precedence: a prerelease sorts
 * before its release, and numeric prerelease identifiers compare as
 * numbers (`nightly.9` < `nightly.10`).
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const clean = v.replace(/^v/, '');
    const dash = clean.indexOf('-');
    const core = dash === -1 ? clean : clean.slice(0, dash);
    const pre = dash === -1 ? [] : clean.slice(dash + 1).split('.');
    return {nums: core.split('.').map(n => Number(n) || 0), pre};
  };
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    const d = (pa.nums[i] || 0) - (pb.nums[i] || 0);
    if (d !== 0) {
      return d;
    }
  }
  if (pa.pre.length === 0 || pb.pre.length === 0) {
    return pb.pre.length - pa.pre.length;
  }
  for (let i = 0; i < Math.max(pa.pre.length, pb.pre.length); i++) {
    const x = pa.pre[i];
    const y = pb.pre[i];
    if (x === undefined || y === undefined) {
      return x === undefined ? -1 : 1;
    }
    const nx = /^\d+$/.test(x);
    const ny = /^\d+$/.test(y);
    if (nx && ny) {
      const d = Number(x) - Number(y);
      if (d !== 0) {
        return d;
      }
    } else if (nx !== ny) {
      return nx ? -1 : 1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

/**
 * Does this version block have curated sections (any `###` heading)?
 * Blocks written before v0.23.0 are a flat list of commits.
 */
export function isCurated(version: ParsedVersion): boolean {
  return version.sections.some(s => s.title !== '');
}

/**
 * Versions in (from, to], oldest first. With `breakingOnly`, keep only the
 * breaking change, behavior change and deprecation sections, and drop versions with none.
 */
export function selectRange(
  versions: ParsedVersion[],
  {
    from,
    to,
    breakingOnly = false,
  }: {from: string; to?: string | null; breakingOnly?: boolean},
): ParsedVersion[] {
  const selected = versions
    .filter(
      v =>
        compareVersions(v.version, from) > 0 &&
        (to == null || compareVersions(v.version, to) <= 0),
    )
    .sort((a, b) => compareVersions(a.version, b.version));
  if (!breakingOnly) {
    return selected;
  }
  return selected
    .map(v => ({
      ...v,
      sections: v.sections.filter(
        s =>
          s.kind === 'breaking' ||
          s.kind === 'behavior' ||
          s.kind === 'deprecation',
      ),
    }))
    .filter(v => v.sections.length > 0);
}

/**
 * Versions in (from, to] that have no curated sections, oldest first.
 */
export function uncuratedInRange(
  versions: ParsedVersion[],
  {from, to}: {from: string; to?: string | null},
): string[] {
  return selectRange(versions, {from, to})
    .filter(v => !isCurated(v))
    .map(v => v.version);
}

/**
 * Render selected versions back to markdown.
 */
export function renderRange(versions: ParsedVersion[]): string {
  return versions
    .map(v => {
      const sections = v.sections.map(s =>
        s.title === '' ? s.body : `### ${s.title}\n\n${s.body}`.trimEnd(),
      );
      return [v.heading, ...sections].join('\n\n');
    })
    .join('\n\n');
}

/**
 * A JSON-friendly view of the selected versions.
 */
export function rangeToJSON(versions: ParsedVersion[]) {
  return versions.map(v => ({
    date: v.date,
    sections: v.sections.map(s => ({
      entries: s.entries.map(e => ({
        behavior: s.kind === 'behavior',
        details: e.details,
        packages: e.packages,
        pr: e.pr,
        prUrl: e.pr != null ? `${REPO_URL}/pull/${e.pr}` : null,
        sections: e.sections,
        summary: e.summary,
      })),
      kind: s.kind,
      text: s.entries.length === 0 ? s.body : undefined,
      title: s.title,
    })),
    version: v.version,
  }));
}
