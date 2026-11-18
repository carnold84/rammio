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

```sh
pnpm changeset  # describe the change and pick a version bump
pnpm changeset version
pnpm release    # build and publish changed packages to npm
```
