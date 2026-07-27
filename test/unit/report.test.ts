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

  it("sorts unknown rules by selector and message", () => {
    const sorted = sortFindings([
      {
        ruleId: "custom.rule",
        severity: "warning",
        selector: "z",
        message: "first",
        evidence: {}
      },
      {
        ruleId: "custom.rule",
        severity: "warning",
        selector: "a",
        message: "second",
        evidence: {}
      },
      {
        ruleId: "custom.rule",
        severity: "warning",
        selector: "a",
        message: "first",
        evidence: {}
      }
    ]);

    expect(sorted.map(({ selector, message }) => [selector, message])).toEqual([
      ["a", "first"],
      ["a", "second"],
      ["z", "first"]
    ]);
  });

  it("formats a compact Markdown report", () => {
    const markdown = formatRenderReport({
      ...report,
      title: "Example\nInjected heading ![pixel](https://example.test/pixel)",
      url: "https://example.test/path|value"
    });
    expect(markdown).toContain("# Render contract report");
    expect(markdown).toContain("390×844");
    expect(markdown).toContain("Optional \\| warning");
    expect(markdown).toContain("Example Injected heading");
    expect(markdown).toContain(
      "\\!\\[pixel\\]\\(https://example.test/pixel\\)"
    );
    expect(markdown).toContain("path\\|value");
  });

  it("neutralizes HTML and terminal control characters", () => {
    const markdown = formatRenderReport({
      ...report,
      title: "<script>alert(1)</script>\u001b[31m"
    });

    expect(markdown).toContain(
      "&lt;script&gt;alert\\(1\\)&lt;/script&gt;�\\[31m"
    );
    expect(markdown).not.toContain("<script>");
    expect(markdown).not.toContain("\u001b");
  });

  it("formats an empty report without optional page metadata", () => {
    const markdown = formatRenderReport({
      ok: true,
      url: "",
      title: "",
      viewport: null,
      findings: []
    });

    expect(markdown).toContain("- URL: (empty)");
    expect(markdown).toContain("- Title: (empty)");
    expect(markdown).toContain("- Viewport: unknown");
    expect(markdown).toContain("No findings.");
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
