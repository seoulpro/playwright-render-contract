# Security policy

Security fixes are made against the latest published release.

## Reporting

Report privately through the repository's
[private vulnerability reporting](https://github.com/seoulpro/playwright-render-contract/security/advisories/new)
feature. Include a minimal fixture and contract, the package and Playwright
versions, browser name, impact, and any mitigation. Do not open a public issue
for a suspected vulnerability.

Data exposure through an unredacted report, unbounded collection of
page-controlled events, listener or protocol-session leakage, and unintended
code execution from page data are security concerns.

## Trust boundaries

Selectors, regular expressions, redactors, and contracts are supplied by the
test author and are trusted code or configuration. Page content is observed
but not treated as trusted. The default URL policy removes embedded
credentials, queries, and fragments. The `full` policy, custom redactors,
console messages, titles, stacks, and custom evidence can still retain
application data. Collected runtime fields, page titles, and URLs are
length-bounded. Runtime events and duplicate-ID findings also have configurable
collection limits; reaching a limit fails the audit rather than silently
claiming completeness. Markdown output collapses whitespace, replaces Unicode
control characters, escapes HTML-significant characters, and escapes the
punctuation that forms Markdown links and images; it does not neutralize every
Markdown construct, and page content is not made trusted.

The package does not isolate browsers, protect test credentials, control
network access, launch a server, or set artifact-retention policy. Test
environments remain responsible for those controls and for reviewing reports
before publishing them.
