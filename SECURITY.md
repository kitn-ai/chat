# Security policy

Covers the two packages published from this repo: **`@kitn.ai/ui`** and **`create-kai`**.

## Reporting a vulnerability

Report it privately: [open a draft advisory](https://github.com/kitn-ai/ui/security/advisories/new) from the Security tab. It reaches the maintainers and stays private until there is a fix.

Don't use the issue tracker for this. It's world-readable, so filing there hands the finding to everyone while every installed copy is still vulnerable.

There is no security email — the advisory form is the only channel. If nothing comes back in two weeks, open a public issue saying you sent a private report, with no details, and that will get attention.

What helps in a report:

- the entry point (`<kai-artifact>`, `@kitn.ai/ui/wire`, a scaffolded route, ...)
- a payload or stream that triggers it
- what an attacker gets out of it
- the version you tested

A working proof of concept is worth far more than a scanner hit.

## Supported versions

**`@kitn.ai/ui`**

| Version | Supported |
| --- | --- |
| 0.25.x | Yes |
| 0.14.1 – 0.24.0 | No. Deprecated on npm, pointing at 0.25.0. |

**`create-kai`**

| Version | Supported |
| --- | --- |
| 0.1.x (latest) | Yes |
| anything older | No |

A scaffolded app pins `@kitn.ai/ui` at the version `create-kai` was built against, and a caret range on a `0.x` version won't cross a minor. Check that pin after scaffolding and raise it to a supported version.

This project is pre-1.0. Fixes land on the current minor and there are no backports to older ones — with a maintainer count this low, that's a promise that would break the first time it was tested. Upgrading the minor is the supported path, and breaking changes are in the changelog.

`@kitn.ai/chat` is the deprecated predecessor of `@kitn.ai/ui` and shares its code lineage. It is unmaintained and gets no fixes. Migrate to `@kitn.ai/ui`.

## Scope

This library renders content it did not author. Anything arriving from a model or a tool call — markdown, reasoning, tool arguments, generative-UI card payloads, artifact URLs, citations — is untrusted input, and a component that lets it reach a script-capable sink is a vulnerability here. That is the first place to look.

Also in scope:

- Content escaping a component's Shadow DOM into the host page's origin.
- `@kitn.ai/ui/wire` parsing a hostile provider stream into state a component then trusts.
- Code emitted by `create-kai` or the `kai` MCP scaffolder that carries a flaw into someone's app. People run that output.

Out of scope:

- **Your backend.** The kit parses, the consumer fetches. There's no HTTP client, no key handling and no provider SDK in this library, so a leaked key or an unauthenticated route is yours.
- **Decisions your app owns.** The kit decides how a message renders; it deliberately doesn't decide whether a user may attach a file, how much they may spend, or what is retained. A missing limit is a feature request.
- A model returning wrong, biased or unpleasant output.
- A dependency advisory with no demonstrated path through this library — take those upstream. Show a path and it's in scope.

## What to expect

- Acknowledgement within 5 working days.
- An assessment — whether it reproduces, how bad it looks, rough plan — within 10 working days.
- A release as soon as there's a fix worth shipping. Critical issues jump everything else.

Deliberately loose numbers. This is a small project, and a policy promising a 24-hour response would be fiction.

## Disclosure

The fix is released before the advisory is published, so there's always a version to upgrade to. Affected versions are deprecated on npm with a message naming the fixed release — that's how the 0.25.0 fix was handled.

Reporters are credited by name or handle, with a link if you want one, unless you'd rather stay anonymous. Say which you prefer.

No bug bounty. There's nothing on offer beyond credit and a quick fix.
