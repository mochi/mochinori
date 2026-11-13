#!/usr/bin/env node

/**
 * `pnpm run release:publish [--dry-run] [--tag latest]`
 *
 * Publish every public package at the root package.json's version, skipping
 * a package whose version is already on npm, so a failed run can simply be
 * run again. Run `pnpm run build` first. Each package gets a copy of the
 * root CHANGELOG.md, so an app can read the history of the version it has
 * installed.
 *
 * In GitHub Actions this publishes with npm trusted publishing (OIDC) and a
 * provenance attestation; see "Releasing" in CONTRIBUTING.md. A package
 * that is not on npm yet needs `pnpm run setup-trusted-publishing` first.
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {parseStrict} from '../changesets/cli.ts';
import {isMain, readPackages, ROOT} from '../changesets/repo.ts';

const USAGE = 'usage: pnpm run release:publish [--dry-run] [--tag <tag>]';
const REGISTRY = 'https://registry.npmjs.org';
async function isPublished(name: string, version: string): Promise<boolean> {
  return registryHas(
    `${name.replace('/', '%2f')}/${encodeURIComponent(version)}`,
  );
}

/**
 * @param route a package name, or `name/version`
 */
async function registryHas(route: string): Promise<boolean> {
  const res = await fetch(`${REGISTRY}/${route}`);
  if (res.status === 404) {
    return false;
  }
  if (!res.ok) {
    throw new Error(`${REGISTRY} answered ${res.status} for ${route}`);
  }
  return true;
}
export async function main(argv: string[]): Promise<number> {
  const parsed = parseStrict(argv, {
    'dry-run': {default: false, type: 'boolean'},
    tag: {default: 'latest', type: 'string'},
  });
  if ('error' in parsed) {
    console.error(`${parsed.error}\n${USAGE}`);
    return 2;
  }
  const {values} = parsed;
  const dryRun = values['dry-run'];
  const version = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
  ).version;
  if (version === '0.0.0') {
    console.error(
      'The root package.json is at 0.0.0: run the "Release" workflow (or `pnpm run release:version`) first.',
    );
    return 1;
  }
  const packages = readPackages(ROOT).filter(p => !p.isPrivate);
  const mismatched = packages.filter(p => p.version !== version);
  if (mismatched.length > 0) {
    console.error(
      `Every published package must be at v${version}:\n` +
        mismatched.map(p => `  - ${p.name} is at ${p.version}`).join('\n'),
    );
    return 1;
  }
  if (process.env.GITHUB_ACTIONS === 'true') {
    // Trusted publishing can only publish a package that already exists.
    const unclaimed = [];
    for (const pkg of packages) {
      if (!(await registryHas(pkg.name.replace('/', '%2f')))) {
        unclaimed.push(pkg.name);
      }
    }
    if (unclaimed.length > 0) {
      console.error(
        `Not on npm yet, so trusted publishing cannot publish them: ${unclaimed.join(', ')}.\n` +
          'A maintainer runs `pnpm run setup-trusted-publishing --bootstrap --setup-trust` locally first; see "Releasing" in CONTRIBUTING.md.',
      );
      return 1;
    }
  }
  const changelog = path.join(ROOT, 'CHANGELOG.md');
  const published = [];
  for (const pkg of packages) {
    const dir = path.join(ROOT, pkg.dir);
    if (await isPublished(pkg.name, version)) {
      console.log(`${pkg.name}@${version} is already on npm; skipping.`);
      continue;
    }
    if (!fs.existsSync(path.join(dir, 'dist'))) {
      console.error(`${pkg.dir}/dist is missing: run \`pnpm run build\`.`);
      return 1;
    }
    fs.copyFileSync(changelog, path.join(dir, 'CHANGELOG.md'));
    const args = [
      'publish',
      '--access',
      'public',
      '--tag',
      values.tag,
      '--no-git-checks',
      ...(process.env.GITHUB_ACTIONS === 'true' ? ['--provenance'] : []),
      ...(dryRun ? ['--dry-run'] : []),
    ];
    console.log(`\n${pkg.name}@${version}: pnpm ${args.join(' ')}`);
    execFileSync('pnpm', args, {cwd: dir, stdio: 'inherit'});
    published.push(pkg.name);
  }
  console.log(
    published.length > 0
      ? `\n${dryRun ? 'Would publish' : 'Published'} v${version}: ${published.join(', ')}`
      : `\nNothing to publish: every package is already at v${version} on npm.`,
  );
  return 0;
}

if (isMain(import.meta.url)) {
  main(process.argv.slice(2)).then(code => {
    process.exitCode = code;
  });
}
