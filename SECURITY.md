# Security policy

Report suspected vulnerabilities privately to the repository owner with a
minimal fixture, contract, Playwright version, and affected package version.

This package executes selectors and regular expressions supplied by the test
author inside a trusted test environment. It does not sanitize untrusted test
configuration, isolate page content, launch a browser, or operate a server.
Applications remain responsible for test credentials, browser sandboxing,
network controls, and artifact retention.

