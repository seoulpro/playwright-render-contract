# Contributing

1. Discuss changes to default rules or report fields before implementation.
2. Reproduce every new rule with one passing and one failing neutral fixture.
3. Keep findings deterministic and JSON-serializable.
4. Do not add fixed sleeps, browser launch logic, product selectors, or
   overlapping visual/a11y audit domains.
5. Run `npm run verify`.

Security reports should follow `SECURITY.md`.

