# Changelog

All mochinori packages are released together at one version.

Each version starts with curated sections, then `### All changes`, which
lists every commit.

- **Breaking changes** need a code change: an API was removed or renamed, a
  type no longer checks, or a call now throws. Each has `Detect:` (what
  identifies affected code) and `Migration:` (what to change).
- **Behavior changes** need no code change to keep building, but behave or
  render differently (HTML or JSON output, the DOM, editing behavior,
  timing). Each has `Verify:`, saying what to test.
- **Deprecations** still work. Each names its replacement and its `Removal:`
  plan.

A version without one of these sections had none of that kind. To print the
part between the version you have and the one you want, run
`pnpm run changelog:range --from <version> [--to <version>] [--breaking]`
in a clone of the repository (`--breaking` keeps the three sections above).
This file also ships in every package, for example as
`node_modules/@mochinori/images/CHANGELOG.md`.
