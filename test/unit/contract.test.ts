import { describe, expect, it } from "vitest";

import {
  defineRenderContract,
  normalizeRenderContract
} from "../../src/index.ts";

describe("render contract normalization", () => {
  it("provides a useful deterministic default contract", () => {
    expect(normalizeRenderContract()).toEqual({
      ready: {
        document: "complete",
        all: [],
        none: [],
        timeoutMs: 5000
      },
      runtime: {
        pageErrors: "error",
        consoleErrors: "error",
        unhandledRejections: "error",
        ignore: []
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
  });

  it("normalizes selector state and open count ranges", () => {
    const normalized = normalizeRenderContract({
      ready: {
        all: [{ selector: "[data-ready]" }],
        none: [{ selector: "[aria-busy=true]", state: "attached" }],
        timeoutMs: 250
      },
      structure: {
        main: { min: 0 },
        visibleH1: { min: 2, max: 3 },
        uniqueIds: "warning"
      }
    });

    expect(normalized.ready.all).toEqual([
      { selector: "[data-ready]", state: "visible" }
    ]);
    expect(normalized.structure.main).toEqual({ min: 0, max: null });
    expect(normalized.structure.visibleH1).toEqual({ min: 2, max: 3 });
    expect(normalized.structure.uniqueIds).toBe("warning");
  });

  it("rejects invalid limits and selectors", () => {
    expect(() =>
      normalizeRenderContract({ ready: { timeoutMs: -1 } })
    ).toThrow("timeoutMs");
    expect(() =>
      normalizeRenderContract({ ready: { all: [{ selector: " " }] } })
    ).toThrow("must not be empty");
    expect(() =>
      normalizeRenderContract({
        structure: { main: { min: 2, max: 1 } }
      })
    ).toThrow("greater than or equal");
  });

  it("keeps literal contract types and object identity", () => {
    const contract = {
      runtime: { consoleErrors: "warning" as const }
    };
    expect(defineRenderContract(contract)).toBe(contract);
  });
});
