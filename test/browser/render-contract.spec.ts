import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { expect, test, type Page, type TestInfo } from "@playwright/test";

import {
  attachRenderReport,
  observePage,
  renderContractMatchers,
  type RenderContract,
  type RenderObserver,
  type RenderReport
} from "../../src/index.ts";

expect.extend(renderContractMatchers);

async function fixtureSource(name: string): Promise<string> {
  return readFile(
    fileURLToPath(new URL(`../fixtures/${name}.html`, import.meta.url)),
    "utf8"
  );
}

async function observeFixture(
  page: Page,
  name: string,
  viewport?: { width: number; height: number }
): Promise<RenderObserver> {
  if (viewport) {
    await page.setViewportSize(viewport);
  }
  const observer = await observePage(page);
  await page.setContent(await fixtureSource(name), {
    waitUntil: "load"
  });
  return observer;
}

async function inspectFixture(
  page: Page,
  name: string,
  contract?: RenderContract,
  viewport?: { width: number; height: number }
): Promise<RenderReport> {
  const observer = await observeFixture(page, name, viewport);
  try {
    return await observer.inspect(contract);
  } finally {
    await observer.dispose();
  }
}

test.describe("healthy pages", () => {
  for (const viewport of [
    { width: 1366, height: 900 },
    { width: 390, height: 844 }
  ]) {
    test(`passes at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      const report = await inspectFixture(
        page,
        "healthy",
        {
          ready: {
            all: [{ selector: "[data-ready=true]" }]
          }
        },
        viewport
      );

      expect(report.ok).toBe(true);
      expect(report.findings).toEqual([]);
      expect(report.viewport).toEqual(viewport);
    });
  }

  test("supports the custom matcher and report attachment", async ({
    page
  }, testInfo: TestInfo) => {
    const observer = await observeFixture(page, "healthy");
    try {
      await expect(observer).toPassRenderContract();
      const report = await observer.inspect();
      await attachRenderReport(report, testInfo);
    } finally {
      await observer.dispose();
    }
  });
});

test("waits for a declared readiness selector without a fixed sleep", async ({
  page
}) => {
  const report = await inspectFixture(page, "delayed-ready", {
    ready: {
      all: [{ selector: "[data-ready=true]", state: "visible" }],
      timeoutMs: 1_000
    }
  });
  expect(report.ok).toBe(true);
  expect(report.findings).toEqual([]);
});

test("reports a forbidden busy state", async ({ page }) => {
  const report = await inspectFixture(page, "stuck-busy", {
    ready: {
      none: [{ selector: "[aria-busy=true]", state: "visible" }],
      timeoutMs: 50
    }
  });
  expect(report.findings.map((finding) => finding.ruleId)).toEqual([
    "readiness.forbidden"
  ]);
});

test("rejects invalid CSS selectors as configuration errors", async ({
  page
}) => {
  const observer = await observeFixture(page, "healthy");
  try {
    await expect(
      observer.inspect({
        ready: {
          all: [{ selector: "[data-ready=" }]
        }
      })
    ).rejects.toThrow("ready.all[0].selector must be valid CSS");
  } finally {
    await observer.dispose();
  }
});

test.describe("runtime collection starts before page content", () => {
  test("captures a synchronous page error", async ({ page }) => {
    const report = await inspectFixture(page, "runtime-throw");
    expect(report.findings.map((finding) => finding.ruleId)).toEqual([
      "runtime.page-error"
    ]);
    expect(report.findings[0]?.message).toContain("runtime boom");
  });

  test("classifies an unhandled promise rejection", async ({ page }) => {
    const report = await inspectFixture(page, "rejected-promise");
    expect(report.findings.map((finding) => finding.ruleId)).toEqual([
      "runtime.unhandled-rejection"
    ]);
    expect(report.findings[0]?.message).toContain("promise boom");
  });

  test("does not replay a rejection on repeated inspection", async ({
    page
  }) => {
    const observer = await observeFixture(page, "rejected-promise");
    try {
      const first = await observer.inspect();
      const second = await observer.inspect();

      expect(first.findings).toEqual(second.findings);
      expect(
        second.findings.filter(
          (finding) => finding.ruleId === "runtime.unhandled-rejection"
        )
      ).toHaveLength(1);
    } finally {
      await observer.dispose();
    }
  });

  test("captures console.error", async ({ page }) => {
    const report = await inspectFixture(page, "console-error");
    expect(report.findings.map((finding) => finding.ruleId)).toEqual([
      "runtime.console-error"
    ]);
    expect(report.findings[0]?.message).toContain("console boom");
  });

  test("applies string ignore rules", async ({ page }) => {
    const report = await inspectFixture(page, "ignored-error", {
      runtime: { ignore: ["known optional issue"] }
    });
    expect(report.ok).toBe(true);
    expect(report.findings).toEqual([]);
  });
});

test.describe("structure rules", () => {
  for (const [fixture, ruleId] of [
    ["missing-main", "structure.main"],
    ["double-h1", "structure.visible-h1"],
    ["duplicate-id", "structure.unique-id"]
  ] as const) {
    test(`${fixture} reports ${ruleId}`, async ({ page }) => {
      const report = await inspectFixture(page, fixture);
      expect(report.findings.map((finding) => finding.ruleId)).toEqual([
        ruleId
      ]);
    });
  }
});

test.describe("viewport rules", () => {
  test("reports document-level horizontal overflow", async ({ page }) => {
    const report = await inspectFixture(
      page,
      "root-overflow",
      { viewport: { tolerancePx: 0 } },
      { width: 320, height: 568 }
    );
    expect(report.findings.map((finding) => finding.ruleId)).toEqual([
      "viewport.horizontal-overflow"
    ]);
    expect(report.findings[0]?.evidence).toMatchObject({
      clientWidth: 320,
      scrollWidth: 1200,
      overflowPx: 880
    });
  });

  test("allows an intentionally scrollable nested carousel", async ({
    page
  }) => {
    const report = await inspectFixture(page, "nested-carousel", undefined, {
      width: 320,
      height: 568
    });
    expect(report.ok).toBe(true);
    expect(report.findings).toEqual([]);
  });
});

test("produces serializable findings in deterministic order", async ({
  page
}) => {
  const observer = await observeFixture(page, "duplicate-id");
  try {
    const first = await observer.inspect({
      structure: { visibleH1: { min: 2, max: 2 } }
    });
    const second = await observer.inspect({
      structure: { visibleH1: { min: 2, max: 2 } }
    });

    expect(first.findings).toEqual(second.findings);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
    expect(first.findings.map((finding) => finding.ruleId)).toEqual([
      "structure.visible-h1",
      "structure.unique-id"
    ]);
  } finally {
    await observer.dispose();
  }
});

test("dispose removes Playwright listeners and is idempotent", async ({
  page
}) => {
  const emitter = page as Page & {
    listenerCount(event: string): number;
  };
  const beforeConsole = emitter.listenerCount("console");
  const beforePageError = emitter.listenerCount("pageerror");
  const observer = await observePage(page);

  expect(emitter.listenerCount("console")).toBe(beforeConsole + 1);
  expect(emitter.listenerCount("pageerror")).toBe(beforePageError + 1);
  await observer.dispose();
  await observer.dispose();
  expect(observer.disposed).toBe(true);
  expect(emitter.listenerCount("console")).toBe(beforeConsole);
  expect(emitter.listenerCount("pageerror")).toBe(beforePageError);
  await expect(observer.inspect()).rejects.toThrow("disposed");
});

test("redacts query strings and fragments from report URLs by default", async ({
  page
}) => {
  await page.route("https://example.test/**", async (route) => {
    await route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><title>Redaction</title></head>
        <body><main><h1>Redacted page</h1></main>
        <script>console.error("bounded location");</script></body></html>`
    });
  });
  const observer = await observePage(page);
  try {
    await page.goto(
      "https://example.test/account?token=secret#private-section"
    );
    const report = await observer.inspect({
      runtime: { consoleErrors: "warning" }
    });
    expect(report.url).toBe("https://example.test/account");
    expect(
      (report.findings[0]?.evidence.location as { url?: string } | undefined)
        ?.url
    ).toBe("https://example.test/account");
  } finally {
    await observer.dispose();
  }
});

test("bounds duplicate-ID collection and reports an incomplete audit", async ({
  page
}) => {
  await page.setContent(`<!doctype html><html><body>
    <main><h1>Bounded IDs</h1>
      <div id="duplicate"></div>
      <div id="duplicate"></div>
      <div id="untracked"></div>
    </main>
  </body></html>`);
  const observer = await observePage(page, {
    maxTrackedIds: 1,
    maxDuplicateIdFindings: 1
  });
  try {
    const report = await observer.inspect();
    expect(report.findings.map((finding) => finding.ruleId)).toContain(
      "structure.id-audit-limit"
    );
    expect(report.ok).toBe(false);
  } finally {
    await observer.dispose();
  }
});

test("does not expose a misleading selector for a truncated ID", async ({
  page
}) => {
  const longId = "x".repeat(600);
  await page.setContent(`<!doctype html><html><body>
    <main><h1>Long ID</h1>
      <div id="${longId}"></div>
      <div id="${longId}"></div>
    </main>
  </body></html>`);
  const observer = await observePage(page);
  try {
    const report = await observer.inspect();
    const finding = report.findings.find(
      (candidate) => candidate.ruleId === "structure.unique-id"
    );

    expect(finding?.selector).toBeUndefined();
    expect(finding?.evidence).toMatchObject({
      count: 2,
      truncated: true
    });
    expect(finding?.message.length).toBeLessThan(600);
  } finally {
    await observer.dispose();
  }
});
