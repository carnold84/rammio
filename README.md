# rammio

Shared tooling config, published under the `@rammio` npm scope.

## Packages

| Package                                          | Description                                                             |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| [`@rammio/biome-config`](packages/biome-config/) | Shared Biome 2 config: formatting, import sorting, React/TS conventions |

## Development

```sh
pnpm install
pnpm check      # lint and format check (this repo uses its own Biome config)
pnpm fix        # apply safe fixes and formatting
```

## Releasing

Releases use [changesets](https://github.com/changesets/changesets) for versioning and npm [staged publishing](https://docs.npmjs.com/cli/v11/commands/npm-stage): CI stages each version with trusted publishing (no npm token in the repo), and it only goes live once a maintainer approves it with 2FA.

```sh
pnpm changeset              # describe the change and pick a version bump
pnpm run version            # apply it: bump versions, update changelogs
git commit -am "Release"    # commit the bump
pnpm changeset tag          # tag each new version, e.g. @rammio/biome-config@1.2.3
git push --follow-tags
```

Each pushed tag runs the Release workflow ([`.github/workflows/release.yml`](.github/workflows/release.yml)), which stages that version on npm with provenance. Prerelease versions are staged under the `next` dist-tag. Then approve it:

```sh
pnpm stage approve   # pick from the staged versions; prompts for 2FA
```

You can also approve on the package's page on npmjs.com. Tags for versions already on npm are skipped, so pushing old tags is harmless.

### One-time setup for a new package

You can only configure trusted publishing for a package that already exists on npm, so publish the first version by hand:

1. `npm login`, then `pnpm release` from a clean `main`.
2. On npmjs.com, go to the package's Settings → Trusted publishing → GitHub Actions and enter owner `carnold84`, repository `rammio`, workflow `release.yml`. Under allowed actions, leave only stage publish enabled.
3. Optional: in the same settings, set publishing access to require 2FA and disallow tokens.
