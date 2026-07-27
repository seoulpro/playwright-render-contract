# Behavior notes

This package is a clean-room implementation of a narrow browser-rendering
contract. It intentionally turns previously implicit audit behavior into a
small public API.

Key decisions:

- observation begins before navigation;
- the browser and test lifecycle remain owned by Playwright;
- readiness uses document and selector predicates instead of a fixed delay;
- page errors, promise rejections, and console errors have distinct rule IDs;
- all applicable findings are reported together;
- findings have stable ordering and JSON-safe evidence;
- runtime event storage is bounded;
- common secret-bearing URL components are redacted by default;
- `dispose()` removes listeners and is idempotent;
- only document-level horizontal overflow is checked;
- product selectors, URLs, data, authentication, and browser binary paths are
  outside the package.

The package deliberately leaves pixel comparison, element overlap, clipping,
alignment, accessibility standards, performance scoring, and browser
orchestration to focused tools that already own those domains.
