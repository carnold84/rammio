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

Releases run from CI ([`.github/workflows/release.yml`](.github/workflows/release.yml)) using [changesets](https://github.com/changesets/changesets) and npm trusted publishing. No npm token is stored in the repo.

```sh
pnpm changeset    # describe the change and pick a version bump
pnpm run version  # apply it: bump versions, update changelogs
```

Commit the result and push to `main`. The Release workflow publishes every package whose version isn't on npm yet, with provenance. If a changeset reaches `main` before you've run `pnpm run version`, the workflow fails instead of silently skipping the release.

### One-time setup for a new package

You can only configure trusted publishing for a package that already exists on npm, so publish the first version by hand:

1. `npm login`, then `pnpm release` from a clean `main`.
2. On npmjs.com, go to the package's Settings → Trusted publishing → GitHub Actions and enter owner `carnold84`, repository `rammio`, workflow `release.yml`.
3. Optional: in the same settings, set publishing access to require 2FA and disallow tokens.
