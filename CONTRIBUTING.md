# Contributing to playwright-render-contract

Bug reports and focused pull requests are welcome. Discuss changes to default
rules, finding IDs, or report fields in an issue before implementation because
they affect stored test artifacts and CI expectations.

## Development

Use Node.js 22 or newer:

```sh
npm install
npx playwright install chromium
npm run verify
```

`npm run verify` runs the full release gate in order: format check, lint, type
check, unit coverage, browser tests, build, package checks, and the
packed-tarball consumer test. Run the individual steps while iterating:

| Command | Purpose |
| --- | --- |
| `npm run format` | Rewrite files to the formatter's style (`format:check` only verifies) |
| `npm run lint` | Lint sources |
| `npm run check` | Type-check with no emit |
| `npm run test:unit` | Unit tests (`test:coverage` adds coverage) |
| `npm run test:browser` | Chromium browser tests |
| `npm run build` | Emit the ESM bundle and type declarations |
| `npm run check:package` | Validate packaging (`publint` and type resolution) |
| `npm run test:package` | Install the packed tarball and check its exports |

## Adding or changing a rule

Every rule needs:

- one neutral fixture that passes;
- one fixture that fails for only the intended reason;
- stable, JSON-serializable evidence;
- deterministic finding order;
- cleanup coverage when listeners or protocol sessions are involved.

Begin observation before navigation when testing runtime events. Do not use
fixed sleeps to make readiness tests pass; expose a page predicate and wait
through Playwright instead.

## Project boundaries

This package owns contract evaluation, not browser orchestration. Keep server
startup, API mocking, product selectors, screenshot comparison, accessibility
standards, and performance scoring in their dedicated tools. New event
collectors must bound retained data and consider whether URLs or messages can
contain secrets.

Report vulnerabilities using [SECURITY.md](./SECURITY.md). Contributions are
licensed under the repository's [MIT license](./LICENSE).
