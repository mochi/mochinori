# Contributing to mochinori

See the [README](README.md) for setting up the repository and
[AGENTS.md](AGENTS.md) for the code conventions. Pull requests follow
[the template](.github/pull_request_template.md).

## Changesets

A changeset is required for every user-facing change: anything that changes
what a published package (`@mochinori/images`, `@mochinori/emoji`, …) does
for the people who use it. It is a short Markdown file in `.changeset/` that
becomes the change's entry in [CHANGELOG.md](CHANGELOG.md) at the next
release. Write it for someone who uses mochinori.

```sh
pnpm run changeset:new --category fix --packages @mochinori/images \
  --summary "Keep an image's alt text when it is made inline"
```

or create the file by hand:

```md
---
'@mochinori/images': patch
---

[fix] Keep an image's alt text when it is made inline
```

- The first line is `[category] one-line summary`. Categories: `breaking`,
  `deprecation`, `feature`, `fix`, `perf`, `docs`, `chore`.
- Use `minor` for `[breaking]` and `patch` for everything else. mochinori is
  `0.x`, so breaking changes ship in minor releases.
- Do not add the pull request number; the release takes it from git.
- A `[breaking]` entry must include `Migration:` (what to change) and
  `Detect:` (what identifies affected code). A `[deprecation]` entry must
  include `Replacement:` and `Removal:`. A fix that changes observable output
  adds `Verify:`.

The full format, with examples, is in
[.changeset/README.md](.changeset/README.md). Tests, the website, scripts
and tooling need no changeset. The Changesets workflow fails a pull request
that changes a published package's `src/` or consumer-facing `package.json`
fields without one; a maintainer can add the `skip-changeset` label when
such a change has no effect on users. `pnpm run check-changesets` validates
the pending changesets, and `pnpm run changelog` previews the CHANGELOG.md
section they would produce.

## Releasing

All published packages are released together at one version, from GitHub
Actions, with
[npm trusted publishing](https://docs.npmjs.com/trusted-publishers): no npm
token is stored in the repository, and every version carries a
[provenance attestation](https://docs.npmjs.com/generating-provenance-statements).

1. Run the **Release** workflow (Actions → Release → Run workflow) on `main`,
   choosing `patch` or `minor`. A pending `[breaking]` changeset requires
   `minor`. The first release is always `0.1.0`.

   It sets the new version in every published package, moves the pending
   changesets into a new CHANGELOG.md section, and opens a `Release vX.Y.Z`
   pull request from the `release/vX.Y.Z` branch.

2. Review the CHANGELOG.md section in that pull request (edit it there if
   needed) and merge it.

3. Merging runs the **Publish** workflow. It builds and tests the packages,
   publishes every package whose version is not yet on npm, then tags
   `vX.Y.Z` and creates the GitHub release with the CHANGELOG.md section as
   its notes. If it fails partway, run Publish again from the Actions tab:
   packages already on npm are skipped. Publish also has a dry-run option.

Pull requests opened by GitHub Actions do not start other workflows, so the
release pull request shows no checks; Publish runs the build and the unit
tests before it publishes anything.

To preview a release locally without changing anything:

```sh
pnpm run release:version --increment minor --dry-run
```

### Continuous releases (pkg.pr.new)

Every commit to a pull request and every commit to `main` publishes all
public packages to [pkg.pr.new](https://github.com/stackblitz-labs/pkg.pr.new)
through the Continuous Releases workflow (`pkg-pr-new.yml`). Nothing goes to
npm.

```sh
npm i https://pkg.pr.new/@mochinori/images@19        # latest commit of PR #19
npm i https://pkg.pr.new/@mochinori/images@4282a68   # a specific commit
npm i https://pkg.pr.new/@mochinori/images@main      # tip of main
```

The pkg.pr.new bot comments the install commands on each pull request.
Previews are built with `pnpm run build` after
`scripts/release/preview-version.ts` stamps a version just after the latest
release: `0.1.1-pr.19.g4282a68` for a pull request and `0.1.1-main.g4282a68`
for `main`.

### One-time setup

These steps need an owner of the `@mochinori` scope on npmjs.com and an
admin of this repository.

1. **npm scope.** Create the `mochinori` organization on npmjs.com (or use
   the account that already owns the `@mochinori` scope), and turn on
   account-level two-factor authentication for every member who can
   publish.

2. **Let GitHub Actions open the release pull request.** In the repository's
   Settings → Actions → General, check "Allow GitHub Actions to create and
   approve pull requests". Without it, the Release workflow still pushes the
   branch, and its summary links to where to open the pull request.

3. **Add the `skip-changeset` label** to the repository (Issues → Labels).

4. **Install the [pkg.pr.new GitHub App](https://github.com/apps/pkg-pr-new)**
   on the repository, for the continuous releases.

5. **Claim the package names and trust the Publish workflow.** npm can only
   trust a workflow for a package that already exists, and Publish has no
   token to fall back on, so this runs once from a maintainer's machine:

   ```sh
   npm login --registry https://registry.npmjs.org
   pnpm run setup-trusted-publishing                      # check only
   pnpm run setup-trusted-publishing --bootstrap --setup-trust
   ```

   `--bootstrap` publishes a deprecated `0.0.0-bootstrap.0` placeholder
   under the `bootstrap` dist-tag for each package not on npm yet, which
   claims the name without touching `latest`. `--setup-trust` runs
   `npm trust github` so each package trusts `publish.yml` in
   mochi/mochinori. It needs npm 11.10 or later (`npm i -g npm@latest`).
   Each write asks for two-factor authentication: on the first prompt, open
   the URL npm prints and choose "Skip two-factor authentication for the
   next 5 minutes" so the rest of the run goes through. The script is
   idempotent and skips packages that are already set up. `--dry-run` shows
   what it would do.

   Then, under each package's Settings → Publishing access on npmjs.com,
   choose "Require two-factor authentication and disallow tokens".

6. Run the Release workflow (choose `minor`) and merge its pull request.

A new package added later needs step 5 again, limited to that package:
`pnpm run setup-trusted-publishing --bootstrap --setup-trust @mochinori/<name>`.
Publish refuses to run while any public package is missing from npm.

### Release protocol

- A breaking change needs a `[breaking]` changeset, and its pull request
  title says `Breaking change`.
- A patch release is refused while a `[breaking]` changeset is pending. If an
  urgent fix has to ship then, release a minor instead (on 0.x that is the
  same kind of release), rather than holding back or splitting the breaking
  change.
- A maintainer can write the changeset for an external contributor (with a
  `PR: #123` line when it lands in a later pull request) or add the
  `skip-changeset` label when the change has no effect on users. When
  reviewing a fix that changes observable output, add a `Verify:` paragraph
  to its changeset.
