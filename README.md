# render-contract

Assert that a Playwright page is ready, structurally sound, free of runtime
errors, and contained within its viewport—without a baseline screenshot.

`render-contract` is a rule layer for an existing Playwright test suite. It
does not launch browsers, host a site, mock APIs, or replace the Playwright
runner.

## Install

```sh
npm install --save-dev render-contract @playwright/test
```

Node.js 22 or newer and Playwright 1.58–1.x are supported. v0.1 is ESM-only and
officially exercises Chromium.

## Quick start

Install the observer before navigation so it can capture startup failures:

```ts
import { expect, test } from "@playwright/test";
import {
  attachRenderReport,
  defineRenderContract,
  observePage,
  renderContractMatchers
} from "render-contract";

expect.extend(renderContractMatchers);

const contract = defineRenderContract({
  ready: {
    all: [{ selector: "[data-ready=true]", state: "visible" }],
    none: [{ selector: "[aria-busy=true]", state: "visible" }],
    timeoutMs: 5_000
  },
  runtime: {
    pageErrors: "error",
    unhandledRejections: "error",
    consoleErrors: "error"
  },
  structure: {
    main: { min: 1, max: 1 },
    visibleH1: { min: 1, max: 1 },
    uniqueIds: "error"
  },
  viewport: {
    horizontalOverflow: "error",
    tolerancePx: 1
  }
});

test("page satisfies its render contract", async ({ page }, testInfo) => {
  const observer = await observePage(page);
  try {
    await page.goto("http://localhost:3000/");
    await expect(observer).toPassRenderContract(contract);

    const report = await observer.inspect(contract);
    await attachRenderReport(report, testInfo);
  } finally {
    await observer.dispose();
  }
});
```

The matcher receives the observer, not the page. This lifecycle is deliberate:
creating an observer after `page.goto()` can miss an early exception,
rejection, or `console.error`.

## Default contract

Calling `observer.inspect()` with no options checks:

- `document.readyState === "complete"`;
- no page errors, unhandled rejections, or `console.error`;
- exactly one `<main>`;
- exactly one visible H1;
- unique IDs;
- no document-level horizontal overflow beyond one pixel.

Warnings are returned but do not make `report.ok` false. Error findings do.

## Readiness

```ts
ready: {
  document: "interactive",
  all: [
    { selector: "[data-shell-ready]", state: "attached" },
    { selector: "[data-content-ready]", state: "visible" }
  ],
  none: [
    { selector: "[aria-busy=true]", state: "visible" },
    { selector: "[data-state=error]", state: "attached" }
  ],
  timeoutMs: 3_000
}
```

Readiness uses selector/document predicates and Playwright timeouts. The
library contains no arbitrary fixed delay. Selectors in v0.1 are CSS selectors.

## Runtime errors

```ts
runtime: {
  pageErrors: "error",
  unhandledRejections: "error",
  consoleErrors: "warning",
  ignore: [
    "known optional integration",
    /^ResizeObserver loop limit exceeded$/
  ]
}
```

Events are collected from observer creation until `inspect()`. Duplicate
Chromium notifications for the same unhandled rejection are collapsed.
`maxRuntimeEvents` bounds memory if a page emits continuously:

```ts
const observer = await observePage(page, { maxRuntimeEvents: 500 });
```

Reaching the limit produces an error finding because the audit is incomplete.
Messages, stacks, titles, and URLs are length-bounded before attachment.

## Structure

```ts
structure: {
  main: { min: 1, max: 1 },
  visibleH1: { min: 1, max: 2 },
  uniqueIds: "warning"
}
```

Omit `max` for an open upper range. `{ min: 0 }` effectively disables a count
requirement. Set `uniqueIds: "off"` to disable that rule.

## Viewport containment

```ts
viewport: {
  horizontalOverflow: "error",
  tolerancePx: 1
}
```

The rule compares the document root's `scrollWidth` and `clientWidth`.
Intentionally scrollable nested carousels do not fail unless they expand the
document itself.

## Reports

```ts
interface RenderReport {
  ok: boolean;
  url: string;
  title: string;
  viewport: { width: number; height: number } | null;
  findings: readonly RenderFinding[];
}
```

Each finding has a stable `ruleId`, severity, message, optional selector, and
JSON-safe evidence. Findings are sorted by rule and selector, so repeated
checks are diff-friendly. `attachRenderReport()` adds JSON and Markdown to the
current Playwright result.

Report URLs remove query strings and fragments by default so test artifacts do
not retain common token locations. Opt in to full URLs only for a safe test
environment, or supply a custom redactor:

```ts
await observePage(page, { urlPolicy: "full" });
await observePage(page, {
  urlPolicy: (url) => url.replace(/\/users\/[^/]+/u, "/users/:id")
});
```

## Cleanup

Always call `dispose()` in `finally`. It removes page and protocol listeners,
is idempotent, and prevents further inspection.

An observer accumulates runtime events for one page journey. Repeated
`inspect()` calls report the same accumulated events; create a new observer for
an independent navigation or retry.

## Non-goals

v0.1 does not perform pixel comparison, clipping/overlap analysis, spatial
alignment checks, CSS root-cause analysis, WCAG auditing, Lighthouse scoring,
web-server orchestration, API mocking, AI judgment, automatic fixes,
cross-origin iframe inspection, or worker inspection.

## Development

```sh
npm install
npx playwright install chromium
npm run verify
```

The browser matrix includes desktop and mobile viewports, delayed readiness,
stuck busy state, three runtime failure classes, structure failures,
root-level overflow, an allowed nested carousel, ignore rules, deterministic
serialization, and listener disposal.

## License

MIT
