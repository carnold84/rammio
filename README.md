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

1. Run `pnpm changeset` to describe the change and pick a version bump, then commit the generated file with your change.
2. When it lands on `main`, the Release workflow opens or updates a "Version Packages" PR that bumps versions and changelogs.
3. Merging that PR publishes the changed packages to npm with provenance.

### One-time setup for a new package

You can only configure trusted publishing for a package that already exists on npm, so publish the first version by hand:

1. `npm login`, then `pnpm release` from a clean `main`.
2. On npmjs.com, go to the package's Settings → Trusted publishing → GitHub Actions and enter owner `carnold84`, repository `rammio`, workflow `release.yml`.
3. Optional: in the same settings, set publishing access to require 2FA and disallow tokens.

The repo also needs Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests" turned on.
