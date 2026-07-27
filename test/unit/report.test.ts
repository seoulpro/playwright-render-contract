import type { TestInfo } from "@playwright/test";
import { describe, expect, it, vi } from "vitest";

import {
  attachRenderReport,
  formatRenderReport,
  sortFindings,
  type RenderReport
} from "../../src/index.ts";

const report: RenderReport = {
  ok: false,
  url: "https://example.test/",
  title: "Example",
  viewport: { width: 390, height: 844 },
  findings: [
    {
      ruleId: "viewport.horizontal-overflow",
      severity: "error",
      message: "Document is 20px wider than the viewport.",
      selector: "html",
      evidence: { overflowPx: 20 }
    },
    {
      ruleId: "runtime.console-error",
      severity: "warning",
      message: "Optional | warning",
      evidence: {}
    }
  ]
};

describe("render reports", () => {
  it("sorts findings by stable rule order", () => {
    const sorted = sortFindings(report.findings);
    expect(sorted.map((finding) => finding.ruleId)).toEqual([
      "runtime.console-error",
      "viewport.horizontal-overflow"
    ]);
  });

  it("formats a compact Markdown report", () => {
    const markdown = formatRenderReport({
      ...report,
      title: "Example\nInjected heading",
      url: "https://example.test/path|value"
    });
    expect(markdown).toContain("# Render contract report");
    expect(markdown).toContain("390×844");
    expect(markdown).toContain("Optional \\| warning");
    expect(markdown).toContain("Example Injected heading");
    expect(markdown).toContain("path\\|value");
  });

  it("attaches JSON and Markdown through Playwright", async () => {
    const attach = vi.fn(async () => undefined);
    await attachRenderReport(report, { attach } as unknown as TestInfo);

    expect(attach).toHaveBeenCalledTimes(2);
    expect(attach).toHaveBeenNthCalledWith(
      1,
      "render-contract.json",
      expect.objectContaining({ contentType: "application/json" })
    );
    expect(attach).toHaveBeenNthCalledWith(
      2,
      "render-contract.md",
      expect.objectContaining({ contentType: "text/markdown" })
    );
  });
});
