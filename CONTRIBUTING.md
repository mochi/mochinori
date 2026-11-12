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
pnpm run changeset:new -- --category fix --packages @mochinori/images \
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
pnpm run release:version -- --increment minor --dry-run
```

### One-time setup

These steps need an owner of the `@mochinori` scope on npmjs.com and an
admin of this repository.

1. **npm scope.** Create the `mochinori` organization on npmjs.com (or use
   the account that already owns the `@mochinori` scope). Turn on two-factor
   authentication for every member who can publish.

2. **Let GitHub Actions open the release pull request.** In the repository's
   Settings → Actions → General, check "Allow GitHub Actions to create and
   approve pull requests". Without it, the Release workflow still pushes the
   branch, and its summary links to where to open the pull request.

3. **Add the `skip-changeset` label** to the repository (Issues → Labels).

4. **First release.** npm can only trust a workflow for a package that
   already exists, so the first version is published with a token:
   1. On npmjs.com, create a granular access token with read and write
      access to the `@mochinori` scope (packages and scopes), that expires
      in a day or two.
   2. Add it as the `NPM_TOKEN` repository secret (Settings → Secrets and
      variables → Actions).
   3. Run the Release workflow and merge its pull request. Publish uses the
      token, still with provenance.

5. **Trusted publishing.** For each published package, on npmjs.com open the
   package → Settings → Trusted Publisher, choose GitHub Actions, and enter
   organization `mochi`, repository `mochinori`, workflow file
   `publish.yml` (leave the environment empty). With npm 11.10 or later the
   same can be done from a terminal after `npm login`:

   ```sh
   npm trust github @mochinori/images --repo mochi/mochinori --file publish.yml
   npm trust github @mochinori/emoji --repo mochi/mochinori --file publish.yml
   ```

   Then, under each package's Settings → Publishing access, choose "Require
   two-factor authentication and disallow tokens", delete the `NPM_TOKEN`
   secret, and revoke the token.

A new package added later needs step 4 again for its first version (or a
one-off `pnpm publish` of it from a maintainer's machine), then step 5.
