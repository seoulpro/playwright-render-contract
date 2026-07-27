import type { ExpectMatcherState } from "@playwright/test";
import { describe, expect, it, vi } from "vitest";

import {
  renderContractMatchers,
  type RenderObserver,
  type RenderReport
} from "../../src/index.ts";

function observerReturning(report: RenderReport): RenderObserver {
  return {
    page: {} as RenderObserver["page"],
    disposed: false,
    inspect: vi.fn(async () => report),
    dispose: vi.fn(async () => undefined)
  };
}

describe("toPassRenderContract matcher", () => {
  it("passes when there are no error findings", async () => {
    const observer = observerReturning({
      ok: true,
      url: "about:blank",
      title: "",
      viewport: null,
      findings: [
        {
          ruleId: "runtime.console-error",
          severity: "warning",
          message: "warning",
          evidence: {}
        }
      ]
    });

    const result =
      await renderContractMatchers.toPassRenderContract.call(
        {} as ExpectMatcherState,
        observer
      );
    expect(result.pass).toBe(true);
  });

  it("returns the report as matcher evidence on failure", async () => {
    const observer = observerReturning({
      ok: false,
      url: "about:blank",
      title: "",
      viewport: null,
      findings: [
        {
          ruleId: "structure.main",
          severity: "error",
          message: "Missing main.",
          selector: "main",
          evidence: {}
        }
      ]
    });

    const result =
      await renderContractMatchers.toPassRenderContract.call(
        {} as ExpectMatcherState,
        observer
      );
    expect(result.pass).toBe(false);
    expect(result.message()).toContain("structure.main");
  });

  it("explains invalid matcher input", async () => {
    const result =
      await renderContractMatchers.toPassRenderContract.call(
        {} as ExpectMatcherState,
        {}
      );
    expect(result.pass).toBe(false);
    expect(result.message()).toContain("observePage");
  });
});
