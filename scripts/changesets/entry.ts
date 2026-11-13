/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * The changeset entry format: one source of truth for parsing, validating
 * and rendering the files in `.changeset/`.
 *
 * Changesets only allows `package: bump` pairs in the frontmatter, so the
 * rest of the convention lives in the body:
 *
 *   ---
 *   '@mochinori/images': minor
 *   ---
 *
 *   [breaking] One-line user-facing summary
 *   @contributor
 *
 *   Optional details.
 *
 *   Migration: what callers have to change (required for breaking).
 *
 *   Detect: symbols or patterns that identify affected code.
 *
 *   Codemod: a codemod, or why there is none.
 *
 * Pure and dependency-free, so CI can run the checks without installing
 * the workspace.
 */

export type Category =
  'breaking' | 'deprecation' | 'feature' | 'fix' | 'perf' | 'docs' | 'chore';

/**
 * Categories in the order the changelog renders them.
 */
export const CATEGORIES: readonly {key: Category; title: string}[] = [
  {key: 'breaking', title: 'Breaking changes'},
  {key: 'deprecation', title: 'Deprecations'},
  {key: 'feature', title: 'Features'},
  {key: 'fix', title: 'Fixes'},
  {key: 'perf', title: 'Performance'},
  {key: 'docs', title: 'Documentation'},
  {key: 'chore', title: 'Other'},
];

const CATEGORY_ALIASES: Readonly<Record<string, Category>> = {
  break: 'breaking',
  breaking: 'breaking',
  'breaking change': 'breaking',
  'breaking-change': 'breaking',
  bug: 'fix',
  'bug fix': 'fix',
  bugfix: 'fix',
  chore: 'chore',
  deprecate: 'deprecation',
  deprecated: 'deprecation',
  deprecation: 'deprecation',
  deprecations: 'deprecation',
  deps: 'chore',
  doc: 'docs',
  docs: 'docs',
  documentation: 'docs',
  feat: 'feature',
  feature: 'feature',
  features: 'feature',
  fix: 'fix',
  fixes: 'fix',
  internal: 'chore',
  other: 'chore',
  perf: 'perf',
  performance: 'perf',
  refactor: 'chore',
};

/**
 * Labeled paragraphs an entry may carry. A label starts a section at the
 * beginning of a line (outside code fences); the section runs until the
 * next label or the end of the entry.
 */
export const SECTION_LABELS = [
  'Migration',
  'Detect',
  'Codemod',
  'Replacement',
  'Removal',
  'Verify',
] as const;

export type SectionKey = Lowercase<(typeof SECTION_LABELS)[number]>;

// Case-sensitive, so prose that wraps onto a line starting with
// "replacement:" or "migration:" is not mistaken for a label.
const SECTION_RE = new RegExp(`^(${SECTION_LABELS.join('|')}):(?:\\s+|$)`);
const CONTRIBUTOR_LINE_RE = /^@[\w-]+(?:[\s,]+@[\w-]+)*$/;
const PR_LINE_RE = /^PR:\s*#?(\d+)\s*$/;
const HEADING_RE = /^ {0,3}#{1,6}(?:\s|$)/;
const PLACEHOLDER_RE = /^(?:TODO\b.*|\.\.\.|<[^>]*>)$/i;
const PR_IN_SUMMARY_RE = /\(#\d+\)\s*$/;
// Wording that suggests a change to a published type signature, which is
// breaking when existing call sites can stop compiling.
const TYPE_CHANGE_RE =
  /\b(?:type[ -](?:param(?:eter)?s?|arguments?)|overloads?|generics?|branded|invariant|(?:return|payload) types?|narrow(?:ed|s)? (?:the )?(?:return|payload)|now returns|signatures?)\b/i;
export function normalizeCategory(
  raw: string | undefined | null,
): Category | null {
  if (raw == null) {
    return null;
  }
  const key = String(raw).trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(CATEGORY_ALIASES, key)
    ? CATEGORY_ALIASES[key]
    : null;
}
export function titleFor(key: Category): string {
  const category = CATEGORIES.find(c => c.key === key);
  return category ? category.title : 'Other';
}

/**
 * Split a changeset file into its frontmatter releases and its body.
 * `problems` lists frontmatter lines that are not `'package': bump`.
 */
export function parseChangesetFile(
  contents: string,
): {releases: Record<string, string>; body: string; problems: string[]} | null {
  const match =
    /^\s*---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)([\s\S]*)$/.exec(
      contents,
    );
  if (!match) {
    return null;
  }
  const releases: Record<string, string> = {};
  const problems: string[] = [];
  for (const line of (match[1] || '').split(/\r?\n/)) {
    if (line.trim() === '') {
      continue;
    }
    if (line.trim().startsWith('#')) {
      problems.push(
        `comments are not supported in the frontmatter ("${line.trim()}"); list only "'package': bump" lines and put notes in the body.`,
      );
      continue;
    }
    const m = /^\s*(['"]?)([^'":#]+)\1\s*:\s*([A-Za-z]+)\s*$/.exec(line);
    if (!m) {
      problems.push(
        `cannot read the frontmatter line "${line.trim()}"; write it as "'package': bump".`,
      );
      continue;
    }
    const name = m[2].trim();
    if (Object.prototype.hasOwnProperty.call(releases, name)) {
      problems.push(`"${name}" is listed more than once in the frontmatter.`);
    }
    releases[name] = m[3].trim();
  }
  return {body: match[2].replace(/\r\n/g, '\n'), problems, releases};
}

export interface Entry {
  /** normalized category, or null */
  category: Category | null;
  /** the tag as written */
  rawCategory: string | null;
  /** the one-line summary */
  summary: string;
  /** GitHub handles without the `@` */
  contributors: string[];
  /** pull request from a `PR: #123` line, if any */
  pr: number | null;
  /** everything after the summary and handles, verbatim */
  details: string;
  /** labeled sections */
  sections: Partial<Record<SectionKey, string>>;
  /** true when the summary paragraph wraps */
  multiLineSummary: boolean;
}

/**
 * Parse a changeset body. Tolerant: problems are reported by validateEntry.
 */
export function parseEntry(body: string): Entry {
  const lines = String(body || '')
    .replace(/\r\n/g, '\n')
    .split('\n');
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') {
    i++;
  }
  let rawCategory = null;
  let summary = '';
  if (i < lines.length) {
    const headline = lines[i].trim();
    const m = /^\[([^\]]+)\]\s*(.*)$/.exec(headline);
    if (m) {
      rawCategory = m[1].trim();
      summary = m[2].trim();
    } else {
      summary = headline;
    }
    i++;
  }
  const contributors: string[] = [];
  let pr: number | null = null;
  let multiLineSummary = false;
  // Lines directly under the headline: contributor handles, a `PR: #123`
  // line, or a wrapped summary (reported: the summary must be one line).
  while (i < lines.length && lines[i].trim() !== '') {
    const line = lines[i].trim();
    const prMatch = PR_LINE_RE.exec(line);
    if (prMatch) {
      pr = Number(prMatch[1]);
    } else if (CONTRIBUTOR_LINE_RE.test(line)) {
      for (const m of line.matchAll(/@([\w-]+)/g)) {
        if (!contributors.includes(m[1])) {
          contributors.push(m[1]);
        }
      }
    } else {
      multiLineSummary = true;
      summary = `${summary} ${line}`;
    }
    i++;
  }
  const rest = lines.slice(i);
  while (rest.length && rest[0].trim() === '') {
    rest.shift();
  }
  while (rest.length && rest[rest.length - 1].trim() === '') {
    rest.pop();
  }
  const details = rest.join('\n');
  return {
    category: normalizeCategory(rawCategory),
    contributors,
    details,
    multiLineSummary,
    pr,
    rawCategory,
    sections: parseSections(details),
    summary,
  };
}

/**
 * Collect the labeled sections of an entry's details.
 */
export function parseSections(
  details: string,
): Partial<Record<SectionKey, string>> {
  const sections: Partial<Record<SectionKey, string>> = {};
  let current: SectionKey | null = null;
  let buffer: string[] = [];
  let inFence = false;
  const flush = () => {
    if (current !== null) {
      sections[current] = trimBlankLines(buffer).join('\n');
    }
  };
  for (const line of details.split('\n')) {
    const unindented = line.replace(/^ {0,3}/, '');
    if (/^(```|~~~)/.test(unindented)) {
      inFence = !inFence;
    }
    const m = inFence ? null : SECTION_RE.exec(line);
    if (m) {
      flush();
      current = m[1].toLowerCase() as SectionKey;
      buffer = [line.slice(m[0].length)];
    } else if (current !== null) {
      buffer.push(line);
    }
  }
  flush();
  return sections;
}
function trimBlankLines(lines: string[]): string[] {
  const out = [...lines];
  while (out.length && out[0].trim() === '') {
    out.shift();
  }
  while (out.length && out[out.length - 1].trim() === '') {
    out.pop();
  }
  return out;
}

export interface ValidationContext {
  /** npm names of releasable packages */
  publicPackages: Set<string>;
  /** npm names of every workspace package */
  allPackages: Set<string>;
}

/**
 * Validate one changeset. Pure, so it can be unit tested without files.
 *
 * @param file display name used in messages
 * @param contents raw changeset markdown
 */
export function validateChangeset(
  file: string,
  contents: string,
  ctx: ValidationContext,
): {errors: string[]; warnings: string[]} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const parsed = parseChangesetFile(contents);
  if (!parsed) {
    errors.push(
      `${file}: missing frontmatter. Start the file with a '---' block that lists each package and its bump, e.g. "'@mochinori/images': patch".`,
    );
    return {errors, warnings};
  }
  const entry = parseEntry(parsed.body);
  for (const problem of parsed.problems) {
    errors.push(`${file}: ${problem}`);
  }
  const names = Object.keys(parsed.releases);
  if (names.length === 0 && parsed.problems.length === 0) {
    errors.push(
      `${file}: the frontmatter lists no packages. Empty changesets are not used here: if the change has no effect on people who use mochinori, delete this file and ask a maintainer for the \`skip-changeset\` label instead.`,
    );
  }
  const expected = entry.category === 'breaking' ? 'minor' : 'patch';
  for (const name of names) {
    const bump = parsed.releases[name];
    if (!ctx.allPackages.has(name)) {
      errors.push(`${file}: unknown package "${name}".`);
    } else if (!ctx.publicPackages.has(name)) {
      errors.push(
        `${file}: "${name}" is private and is never published; list the published package(s) the change affects instead.`,
      );
    }
    if (bump === 'major') {
      errors.push(
        `${file}: "${name}" declares "major". mochinori is 0.x, where a major bump would publish 1.0.0; that is a deliberate maintainer decision, not a changeset. Breaking changes use [breaking] with "minor".`,
      );
    } else if (bump !== 'minor' && bump !== 'patch') {
      errors.push(
        `${file}: "${name}" has bump "${bump}"; use "minor" for [breaking] and "patch" for everything else.`,
      );
    } else if (entry.category !== null && bump !== expected) {
      errors.push(
        expected === 'minor'
          ? `${file}: "${name}" is [breaking] but declares "${bump}". Breaking changes ship in a minor release while mochinori is 0.x; use "minor".`
          : `${file}: "${name}" declares "minor" but the category is [${entry.category}]. Only [breaking] changes bump the minor; use "patch" (or [breaking] if callers have to change their code).`,
      );
    }
  }
  if (entry.rawCategory === null) {
    errors.push(
      `${file}: the first line must start with a category, e.g. "[fix] Keep the caret in view after paste". Categories: ${CATEGORIES.map(c => c.key).join(', ')}.`,
    );
  } else if (entry.category === null) {
    errors.push(
      `${file}: unknown category "[${entry.rawCategory}]". Use one of: ${CATEGORIES.map(c => c.key).join(', ')}.`,
    );
  }
  if (entry.summary === '') {
    errors.push(`${file}: the first line has no summary after the category.`);
  }
  if (entry.multiLineSummary) {
    errors.push(
      `${file}: the summary must be a single line. Put a blank line after it and write details as their own paragraphs.`,
    );
  }
  if (PR_IN_SUMMARY_RE.test(entry.summary)) {
    warnings.push(
      `${file}: drop the "(#123)" from the summary; the release links the pull request from git history. When a changeset is added in a different pull request than the change, put a "PR: #123" line under the summary instead.`,
    );
  }
  let inFence = false;
  for (const line of parsed.body.split('\n')) {
    if (/^ {0,3}(```|~~~)/.test(line)) {
      inFence = !inFence;
    } else if (!inFence && HEADING_RE.test(line)) {
      errors.push(
        `${file}: Markdown headings ("${line.trim()}") are not allowed in a changeset; they would break the CHANGELOG.md structure. Use a paragraph or **bold** text instead.`,
      );
      break;
    }
  }
  for (const [key, value] of Object.entries(entry.sections)) {
    if (value !== undefined && PLACEHOLDER_RE.test(value.trim())) {
      errors.push(
        `${file}: the "${key[0].toUpperCase()}${key.slice(1)}:" paragraph is still a placeholder ("${value.trim()}"); fill it in or remove it.`,
      );
    }
  }
  if (entry.category === 'breaking') {
    if (!entry.sections.migration) {
      errors.push(
        `${file}: [breaking] entries need a "Migration:" paragraph that tells callers what to change (before/after code is welcome).`,
      );
    }
    if (!entry.sections.detect) {
      errors.push(
        `${file}: [breaking] entries need a "Detect:" paragraph naming what identifies affected code, usually the symbol, import or CSS class, e.g. "Detect: imports of \`toggleLink\`."`,
      );
    }
  }
  if (
    (entry.category === 'deprecation' || entry.category === 'chore') &&
    !entry.sections.detect &&
    TYPE_CHANGE_RE.test(`${entry.summary}\n${entry.details}`)
  ) {
    warnings.push(
      `${file}: this [${entry.category}] entry mentions a type parameter, overload, generic or signature but has no "Detect:" paragraph. If any existing call site can stop compiling (including calls that relied on an inferred type argument), the change is [breaking]: use "minor", and name those call shapes in "Detect:" and the replacement in "Migration:". If none can, add a "Detect:" paragraph saying so. See "Type signature changes" in .changeset/README.md.`,
    );
  }
  if (entry.category === 'deprecation') {
    if (!entry.sections.replacement) {
      errors.push(
        `${file}: [deprecation] entries need a "Replacement:" paragraph naming what to use instead (or "Replacement: none" and why).`,
      );
    }
    const removal = entry.sections.removal;
    if (!removal) {
      errors.push(
        `${file}: [deprecation] entries need a "Removal:" paragraph: a version ("Removal: v0.60.0"), "Removal: no earlier than v0.60.0", or "Removal: not scheduled".`,
      );
    } else if (!PLACEHOLDER_RE.test(removal.trim()) && !isRemoval(removal)) {
      errors.push(
        `${file}: "Removal: ${removal.split('\n')[0]}" must start with a version ("v0.60.0"), "no earlier than v0.60.0", or "not scheduled".`,
      );
    }
  }
  return {errors, warnings};
}

const REMOVAL_RE =
  /^(?:v\d+\.\d+(?:\.\d+)?|no earlier than v\d+\.\d+(?:\.\d+)?|not scheduled)(?=$|[\s,;:(]|\.(?:\s|$))/i;

/**
 * Is this a valid `Removal:` value: a version, "no earlier than <version>",
 * or "not scheduled", optionally followed by more text?
 */
export function isRemoval(value: string): boolean {
  return REMOVAL_RE.test(value.trim());
}

/**
 * Does this entry change observable behavior without being breaking? Such
 * entries carry a `Verify:` paragraph and render under "Behavior changes".
 */
export function isBehaviorChange(entry: {
  category: Category | null;
  details: string;
}): boolean {
  return (
    entry.category !== 'breaking' &&
    Boolean(parseSections(entry.details).verify)
  );
}

/**
 * Sort npm names alphabetically.
 */
export function sortPackages(names: Iterable<string>): string[] {
  return [...names].sort((a, b) => a.localeCompare(b));
}

export const REPO_URL = 'https://github.com/mochi/mochinori';

export interface ReleaseEntry {
  category: Category;
  /** npm names */
  packages: string[];
  summary: string;
  details: string;
  /** pull request number, if known */
  pr: number | null;
  /** handles (`@x`) or names */
  contributors: string[];
}

/**
 * Render one changelog bullet. The details are reproduced verbatim,
 * indented so they stay inside the list item.
 */
export function renderEntry(entry: ReleaseEntry): string {
  const packages = sortPackages(entry.packages);
  const prefix = packages.length > 0 ? `**${packages.join(', ')}**: ` : '';
  const pr =
    entry.pr != null ? ` ([#${entry.pr}](${REPO_URL}/pull/${entry.pr}))` : '';
  let out = `- ${prefix}${entry.summary}${pr}`;
  if (entry.details.trim() !== '') {
    out +=
      '\n\n' +
      entry.details
        .split('\n')
        .map(line => (line.trim() === '' ? '' : `  ${line}`))
        .join('\n');
  }
  return out;
}
