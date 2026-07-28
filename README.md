# playwright-render-contract

Assert that a Playwright page is ready, structurally sound, free of runtime
errors, and contained within its viewport. These checks complement Playwright
screenshot assertions: a screenshot compares how the page looks against a
baseline, and a render contract catches readiness, runtime, structure, and
viewport problems that a picture can miss.

`playwright-render-contract` is a rule layer for an existing Playwright test
suite. It does not launch browsers, host a site, mock APIs, or replace the
Playwright runner.

## Install

```sh
npm install --save-dev playwright-render-contract @playwright/test
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
} from "playwright-render-contract";

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

## Working with screenshot checks

Screenshot assertions and render contracts answer different questions about the
same page. A screenshot compares appearance against a baseline; a render
contract checks whether the page settled, ran without runtime errors, and holds
its expected structure and width. Run both against the same page and read the
results together:

| Screenshot | Render contract | Reading |
| --- | --- | --- |
| Unchanged | Passes | Appearance matches the baseline and the readiness, runtime, structure, and viewport checks hold. |
| Unchanged | Fails | A visually silent regression—an early runtime error, a missing landmark, duplicate IDs, or overflow the baseline did not reveal. |
| Changed | Passes | The difference is visual only; the contract finds no readiness, runtime, structure, or viewport fault. |
| Changed | Fails | Both kinds of regression are present: appearance moved and a contract check broke. |

### Example: staged loading

Some pages reach their final appearance in stages. An interactive map, for
instance, may first paint low-detail tiles and then swap in detailed ones; a
screenshot taken too early captures the coarse frame. This models that class of
problem and does not imply integration with any particular mapping service.

Let the contract gate the screenshot on a settled state. The recommended order
is:

1. create the observer before navigation, so startup failures are captured;
2. navigate, then wait for the meaningful settled marker and the absence of any
   busy or low-quality state;
3. take the screenshot once the contract passes.

```ts
const observer = await observePage(page);
try {
  await page.goto("http://localhost:3000/map");
  await expect(observer).toPassRenderContract({
    ready: {
      all: [
        {
          selector: 'main[data-render-state="settled"][data-map-ready="true"]',
          state: "visible"
        }
      ],
      none: [
        { selector: 'main[aria-busy="true"]', state: "visible" },
        { selector: '[data-tile-quality="low"]', state: "visible" }
      ],
      timeoutMs: 15_000
    }
  });
  await expect(page).toHaveScreenshot("map-settled.png");
} finally {
  await observer.dispose();
}
```

The application owns what the settled marker means and when it is set. If the
marker is raised before the detailed tiles are in place, the contract passes
early and the screenshot is still premature: the library waits for the marker
but cannot correct one set too soon. The full
[progressive-rendering example](https://github.com/seoulpro/playwright-render-contract/blob/main/examples/progressive-rendering.spec.ts)
shows this end to end.

## Default contract

Calling `observer.inspect()` with no options checks:

- `document.readyState === "complete"`;
- no page errors, unhandled rejections, or `console.error`;
- exactly one `<main>`;
- exactly one visible H1;
- unique IDs;
- no document-level horizontal overflow beyond one pixel.

Findings carry a severity. An `"error"` finding sets `report.ok` to `false` and
fails `toPassRenderContract`; a `"warning"` finding is still reported but leaves
the contract passing. The runtime channels, `uniqueIds`, and
`horizontalOverflow` accept `"error"`, `"warning"`, or `"off"`. Readiness
timeouts, out-of-range `main` and `visibleH1` counts, and incomplete-audit
findings are always errors.

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

Readiness uses selector and document predicates with Playwright timeouts; the
library adds no fixed delay of its own. Selectors are CSS selectors and are
validated before use: invalid CSS raises a configuration error immediately
rather than waiting out the timeout and reporting a readiness failure.

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

Events are collected from observer creation until `inspect()`. When Chromium
reports one failure as both a page error and an unhandled rejection, the two
land next to each other; if their normalized messages match and they are
adjacent—no more than one sequence step apart—they are paired one to one and the
duplicate page error is dropped so the failure is counted once. When the match
is ambiguous or the entries are not adjacent, both findings are kept rather than
risk hiding a real error. `maxRuntimeEvents` bounds memory if a page emits
continuously:

```ts
const observer = await observePage(page, { maxRuntimeEvents: 500 });
```

Reaching the limit produces an error finding because the audit is incomplete.
Duplicate-ID collection is likewise bounded to 10,000 tracked IDs and 100
individual findings by default. Tune `maxTrackedIds` and
`maxDuplicateIdFindings` when auditing unusually large documents; reaching
either limit produces an incomplete-audit error finding.

Unhandled promise rejections are classified through a Chromium CDP session, so
this check is exercised on Chromium. If that session cannot be opened, or if it
closes during the run while `runtime.unhandledRejections` is not `"off"`,
`inspect()` fails closed with a `runtime.unhandled-rejection-audit-unavailable`
error instead of reporting a page as clean when rejections may have gone
unseen. Set `runtime.unhandledRejections: "off"` to accept that gap and suppress
the finding. Page errors and `console.error` are collected through portable
Playwright page events and do not depend on CDP.

Collected runtime messages and stacks, page titles, and URLs are length-bounded
before attachment.
Markdown output collapses whitespace, replaces Unicode control characters,
escapes HTML-significant characters, and escapes the punctuation that forms
Markdown links and images; it does not neutralize every Markdown construct, and
page content is not treated as trusted. JSON reports can still carry application
data and should be reviewed before public artifact retention.

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

Report URLs remove embedded credentials, query strings, and fragments by
default so test artifacts do not retain common token locations. URLs remain
length-bounded with every policy. Opt in to full URLs only for a safe test
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
web-server orchestration, API mocking, cross-origin iframe inspection, or
worker inspection.

Visual differences—colors, spacing, alignment, clipping or overlap, icons, and
similar details—remain the domain of screenshot testing; a render contract does
not inspect pixels.

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

The [design notes](./docs/design-notes.md) explain the lifecycle and reporting
decisions behind the public API.

See [CONTRIBUTING.md](./CONTRIBUTING.md) before adding a rule or changing report
fields. Report vulnerabilities privately as described in
[SECURITY.md](./SECURITY.md).

## License

[MIT](./LICENSE)
