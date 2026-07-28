## Purpose and scope

Describe what this change does and why.

## Related issue

Related issue: #

## Type of change

- [ ] Bug fix
- [ ] New or changed rule
- [ ] Documentation only
- [ ] Other

## Checks

Mark the items that apply. Not every item applies to every change.

- [ ] `npm run verify` passes locally
- [ ] New or changed rules add a neutral fixture that passes and a fixture that
      fails only for the intended reason
- [ ] Findings keep deterministic ordering and JSON-safe evidence
- [ ] Page listeners and protocol sessions are disposed
- [ ] Readiness uses explicit predicates rather than fixed sleeps
- [ ] Finding IDs and report fields remain compatible, or the break is called
      out and justified
- [ ] The change stays within project boundaries: readiness, runtime, structure,
      and viewport contracts, rather than browser orchestration, server startup,
      API mocking, product selectors, accessibility standards, performance
      scoring, or pixel diffing
- [ ] Documentation is updated where behavior or configuration changed
- [ ] Reports, fixtures, and attachments were reviewed for privacy; no secrets,
      credentials, or unredacted application data are included
