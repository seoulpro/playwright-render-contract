# Design notes

The package keeps browser-rendering checks narrow enough to produce stable CI
results without owning the surrounding Playwright lifecycle.

The contract makes these decisions explicit:

- observation begins before navigation;
- the browser and test lifecycle remain owned by Playwright;
- readiness uses document and selector predicates instead of a fixed delay;
- page errors, promise rejections, and console errors have distinct rule IDs;
- promise-rejection classification uses a Chromium CDP session and fails closed
  when that session is unavailable, rather than reporting a page as clean;
- all applicable findings are reported together;
- findings have stable ordering and JSON-safe evidence;
- runtime event storage is bounded;
- embedded URL credentials, queries, and fragments are redacted by default;
- report text is bounded, and Markdown output escapes HTML-significant
  characters and the punctuation that forms Markdown links and images without
  neutralizing every Markdown construct or treating page content as trusted;
- `dispose()` removes listeners and is idempotent;
- only document-level horizontal overflow is checked;
- product selectors, URLs, data, authentication, and browser binary paths are
  outside the package.

The package deliberately leaves pixel comparison, element overlap, clipping,
alignment, accessibility standards, performance scoring, and browser
orchestration to focused tools that already own those domains.
