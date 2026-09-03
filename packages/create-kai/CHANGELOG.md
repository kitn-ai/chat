# Changelog

## [0.6.0](https://github.com/kitn-ai/ui/compare/create-kai-v0.5.0...create-kai-v0.6.0) (2026-09-03)


### ⚠ BREAKING CHANGES

* **create-kai:** `create-kai add <block>` writes the react form to `src/components/<id>/` instead of `src/blocks/<id>/`.

### Features

* **create-kai:** add writes at the blocks targets table, and detects the host framework ([1528bb7](https://github.com/kitn-ai/ui/commit/1528bb71684948547a2e8490c81c750e1a807b22))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @kitn.ai/ui bumped to 0.33.0

## [0.5.0](https://github.com/kitn-ai/ui/compare/create-kai-v0.4.0...create-kai-v0.5.0) (2026-09-03)


### Features

* **blocks:** the authored contract, and the html / react / cdn renderers ([#374](https://github.com/kitn-ai/ui/issues/374)) ([c785d1a](https://github.com/kitn-ai/ui/commit/c785d1a389449c7582c33fd11a48d7e4cfd68ed7))
* **create-kai:** add &lt;block&gt; — registry resolution, framework detection, three forms ([8d9353d](https://github.com/kitn-ai/ui/commit/8d9353d81b4bb38cb3f0e737064d04105254a4e0))
* **gallery:** the framework axis, zip download, and icon buttons (owner round 2) ([497f583](https://github.com/kitn-ai/ui/commit/497f5834cf6de511141a7927ff6cd3853b244586))


### Bug Fixes

* **create-kai:** wizard registry catches up to the current construct schema ([3efeed6](https://github.com/kitn-ai/ui/commit/3efeed6f651ff94fbdbe19207ad632184411fc88))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @kitn.ai/ui bumped to 0.32.0

## [0.4.0](https://github.com/kitn-ai/ui/compare/create-kai-v0.3.1...create-kai-v0.4.0) (2026-08-29)


### ⚠ BREAKING CHANGES

* template registry, phase-1 construct vocabulary, and the visual builder (kai dev --builder) ([#350](https://github.com/kitn-ai/ui/issues/350))

### Features

* template registry, phase-1 construct vocabulary, and the visual builder (kai dev --builder) ([#350](https://github.com/kitn-ai/ui/issues/350)) ([1b0c014](https://github.com/kitn-ai/ui/commit/1b0c01440c25c744dde7bfbedd9340ced5cbc77e))


### Bug Fixes

* **builder:** dark-by-default builder + starters (widget excepted), restore token imports in the page CSS pipeline ([#351](https://github.com/kitn-ai/ui/issues/351)) ([7a7bfbe](https://github.com/kitn-ai/ui/commit/7a7bfbe8d6cb3357958d33c8c836972bc35df232))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @kitn.ai/ui bumped to 0.31.0

## [0.3.1](https://github.com/kitn-ai/ui/compare/create-kai-v0.3.0...create-kai-v0.3.1) (2026-08-28)


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @kitn.ai/ui bumped to 0.30.0

## [0.3.0](https://github.com/kitn-ai/ui/compare/create-kai-v0.2.2...create-kai-v0.3.0) (2026-08-28)


### Features

* npm create kai wizard, kai bin alias, public construct schema export ([cd37677](https://github.com/kitn-ai/ui/commit/cd376770c7b270f6282d6a270b69cdf380a8168a))


### Bug Fixes

* **create-kai:** '.' and path positionals scaffold with a basename-derived name ([e872b33](https://github.com/kitn-ai/ui/commit/e872b331df5c7b9efe265a766c27bab37f169e3d))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @kitn.ai/ui bumped to 0.29.0

## [0.2.2](https://github.com/kitn-ai/ui/compare/create-kai-v0.2.1...create-kai-v0.2.2) (2026-08-27)


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @kitn.ai/ui bumped to 0.28.0

## [0.2.1](https://github.com/kitn-ai/ui/compare/create-kai-v0.2.0...create-kai-v0.2.1) (2026-08-26)


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @kitn.ai/ui bumped to 0.27.0

## [0.2.0](https://github.com/kitn-ai/ui/compare/create-kai-v0.1.4...create-kai-v0.2.0) (2026-08-24)


### ⚠ BREAKING CHANGES

* the workspace re-cast — construction over configuration, both phases ([#302](https://github.com/kitn-ai/ui/issues/302))

### Features

* the workspace re-cast — construction over configuration, both phases ([#302](https://github.com/kitn-ai/ui/issues/302)) ([2d2aca0](https://github.com/kitn-ai/ui/commit/2d2aca0f166214a806b7d24a00c7951d8dd04bba))


### Bug Fixes

* **create-kai:** offer only what scaffolds, and state what has one answer ([#275](https://github.com/kitn-ai/ui/issues/275)) ([dea2017](https://github.com/kitn-ai/ui/commit/dea2017011da80f86f3c96cea7f7e7b3c32ff431))
* **scripts:** read the npm 12 pack listing in packages/ui, and guard the shape ([#271](https://github.com/kitn-ai/ui/issues/271)) ([d7a9942](https://github.com/kitn-ai/ui/commit/d7a9942a42cd35aabe61f32aeb7bc64b0758ec61))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @kitn.ai/ui bumped to 0.26.0

## [0.1.4](https://github.com/kitn-ai/ui/compare/create-kai-v0.1.3...create-kai-v0.1.4) (2026-08-15)


### Bug Fixes

* make a release rewrite the CDN pins it invalidates ([#258](https://github.com/kitn-ai/ui/issues/258)) ([b688ae7](https://github.com/kitn-ai/ui/commit/b688ae748a2f45648e5718dc19eb4d184cd59afc))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @kitn.ai/ui bumped to 0.25.2

## [0.1.3](https://github.com/kitn-ai/ui/compare/create-kai-v0.1.2...create-kai-v0.1.3) (2026-08-15)


### Bug Fixes

* **create-kai:** re-cut the kit pin, and stop it stranding on every kit minor ([#249](https://github.com/kitn-ai/ui/issues/249)) ([b892497](https://github.com/kitn-ai/ui/commit/b892497b3c9fc226f7b608ec79c0aa8fd74167b0))
* **docs:** stop serving CDN URLs pinned to advisory-covered versions ([#252](https://github.com/kitn-ai/ui/issues/252)) ([8baffe4](https://github.com/kitn-ai/ui/commit/8baffe4d9568344128512ef5674652b1f83cc236))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @kitn.ai/ui bumped to 0.25.1

## [0.1.2](https://github.com/kitn-ai/ui/compare/create-kai-v0.1.1...create-kai-v0.1.2) (2026-08-14)


### Bug Fixes

* **create-kai:** read the packed listing on npm 12, which failed the release publish ([#241](https://github.com/kitn-ai/ui/issues/241)) ([df4b428](https://github.com/kitn-ai/ui/commit/df4b42851038ab09da62e9e57b6c858503e73922))

## [0.1.1](https://github.com/kitn-ai/ui/compare/create-kai-v0.1.0...create-kai-v0.1.1) (2026-08-14)


### Bug Fixes

* **create-kai:** build the CLI before npm packs it ([#234](https://github.com/kitn-ai/ui/issues/234)) ([0f6ab86](https://github.com/kitn-ai/ui/commit/0f6ab86a495cd4ac8e2d2d8db76720944907b4db))
* **create-kai:** npm strips .npmrc, so nextjs and tanstack-start cannot scaffold at all ([#239](https://github.com/kitn-ai/ui/issues/239)) ([7ba376d](https://github.com/kitn-ai/ui/commit/7ba376d8a7418777d04a9705aab849a7e383ec18))
