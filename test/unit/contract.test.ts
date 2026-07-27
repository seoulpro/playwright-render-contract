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
    expect(() => normalizeRenderContract({ ready: { timeoutMs: -1 } })).toThrow(
      "timeoutMs"
    );
    expect(() => normalizeRenderContract({ ready: { timeoutMs: 0 } })).toThrow(
      "positive"
    );
    expect(() =>
      normalizeRenderContract({ ready: { all: [{ selector: " " }] } })
    ).toThrow("must not be empty");
    expect(() =>
      normalizeRenderContract({
        ready: { all: [{ selector: "x".repeat(2_049) }] }
      })
    ).toThrow("must not exceed");
    expect(() =>
      normalizeRenderContract({
        structure: { main: { min: 2, max: 1 } }
      })
    ).toThrow("greater than or equal");
    expect(() =>
      normalizeRenderContract({
        structure: { visibleH1: { min: -1 } }
      })
    ).toThrow("non-negative integer");
    expect(() =>
      normalizeRenderContract({
        viewport: { tolerancePx: Number.NaN }
      })
    ).toThrow("tolerancePx");
  });

  it("rejects invalid runtime configuration from JavaScript callers", () => {
    expect(() =>
      normalizeRenderContract(
        null as unknown as Parameters<typeof normalizeRenderContract>[0]
      )
    ).toThrow("must be an object");
    expect(() =>
      normalizeRenderContract({
        ready: { document: "loaded" }
      } as unknown as Parameters<typeof normalizeRenderContract>[0])
    ).toThrow("ready.document");
    expect(() =>
      normalizeRenderContract({
        runtime: { consoleErrors: "fatal" }
      } as unknown as Parameters<typeof normalizeRenderContract>[0])
    ).toThrow("runtime.consoleErrors");
    expect(() =>
      normalizeRenderContract({
        runtime: { ignore: [42] }
      } as unknown as Parameters<typeof normalizeRenderContract>[0])
    ).toThrow("runtime.ignore");
    expect(() =>
      normalizeRenderContract({
        ready: { all: "main" }
      } as unknown as Parameters<typeof normalizeRenderContract>[0])
    ).toThrow("ready.all must be an array");
    expect(() =>
      normalizeRenderContract({
        ready: { all: [null] }
      } as unknown as Parameters<typeof normalizeRenderContract>[0])
    ).toThrow("selector string");
    expect(() =>
      normalizeRenderContract({
        ready: { all: [{ selector: "main", state: "shown" }] }
      } as unknown as Parameters<typeof normalizeRenderContract>[0])
    ).toThrow("condition state");
  });

  it("rejects misspelled and inherited contract fields", () => {
    expect(() =>
      normalizeRenderContract({
        runTime: {}
      } as unknown as Parameters<typeof normalizeRenderContract>[0])
    ).toThrow("unknown render contract field");
    expect(() =>
      normalizeRenderContract({
        ready: { timeOutMs: 10 }
      } as unknown as Parameters<typeof normalizeRenderContract>[0])
    ).toThrow("unknown ready field");

    const inherited = Object.create({
      runtime: { consoleErrors: "off" }
    }) as Parameters<typeof normalizeRenderContract>[0];
    expect(normalizeRenderContract(inherited).runtime.consoleErrors).toBe(
      "error"
    );
  });

  it("keeps literal contract types and object identity", () => {
    const contract = {
      runtime: { consoleErrors: "warning" as const }
    };
    expect(defineRenderContract(contract)).toBe(contract);
  });
});
