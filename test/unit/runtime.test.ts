import { describe, expect, it } from "vitest";

import { normalizeRenderContract } from "../../src/contract.ts";
import { inspectRuntime } from "../../src/rules/runtime.ts";

describe("runtime findings", () => {
  it("does not mutate caller-owned regular expression state", () => {
    const pattern = /optional/gu;
    pattern.lastIndex = 2;
    const contract = normalizeRenderContract({
      runtime: { ignore: [pattern] }
    });

    const findings = inspectRuntime(
      {
        dropped: 0,
        unhandledRejectionCollection: "supported",
        events: [
          {
            kind: "console-error",
            message: "optional integration failed",
            sequence: 0
          }
        ]
      },
      contract.runtime
    );

    expect(findings).toEqual([]);
    expect(pattern.lastIndex).toBe(2);
  });

  it("fails closed when rejection auditing is unavailable", () => {
    const contract = normalizeRenderContract();

    const findings = inspectRuntime(
      {
        dropped: 0,
        events: [],
        unhandledRejectionCollection: "unavailable"
      },
      contract.runtime
    );

    expect(findings).toEqual([
      expect.objectContaining({
        ruleId: "runtime.unhandled-rejection-audit-unavailable",
        severity: "error"
      })
    ]);
  });

  it("allows the unavailable collector when rejection auditing is off", () => {
    const contract = normalizeRenderContract({
      runtime: { unhandledRejections: "off" }
    });

    const findings = inspectRuntime(
      {
        dropped: 0,
        events: [],
        unhandledRejectionCollection: "unavailable"
      },
      contract.runtime
    );

    expect(findings).toEqual([]);
  });

  it("does not collapse distinct messages that merely contain each other", () => {
    const contract = normalizeRenderContract();

    const findings = inspectRuntime(
      {
        dropped: 0,
        unhandledRejectionCollection: "supported",
        events: [
          {
            kind: "page-error",
            message: "request failed after timeout",
            sequence: 0
          },
          {
            kind: "unhandled-rejection",
            message: "request failed",
            sequence: 1
          }
        ]
      },
      contract.runtime
    );

    expect(findings.map((finding) => finding.ruleId)).toEqual([
      "runtime.page-error",
      "runtime.unhandled-rejection"
    ]);
  });

  it("collapses matching rejection and page-error notifications", () => {
    const contract = normalizeRenderContract();

    const findings = inspectRuntime(
      {
        dropped: 0,
        unhandledRejectionCollection: "supported",
        events: [
          {
            kind: "page-error",
            message: "Error: request failed",
            sequence: 0
          },
          {
            kind: "unhandled-rejection",
            message: "Uncaught (in promise) request failed",
            sequence: 1
          }
        ]
      },
      contract.runtime
    );

    expect(findings.map((finding) => finding.ruleId)).toEqual([
      "runtime.unhandled-rejection"
    ]);
  });

  it("matches duplicate notifications one to one", () => {
    const contract = normalizeRenderContract();

    const findings = inspectRuntime(
      {
        dropped: 0,
        unhandledRejectionCollection: "supported",
        events: [
          {
            kind: "page-error",
            message: "request failed",
            sequence: 0
          },
          {
            kind: "page-error",
            message: "request failed",
            sequence: 1
          },
          {
            kind: "unhandled-rejection",
            message: "request failed",
            sequence: 2
          }
        ]
      },
      contract.runtime
    );

    expect(
      findings.map((finding) => [finding.ruleId, finding.evidence.sequence])
    ).toEqual([
      ["runtime.page-error", 0],
      ["runtime.unhandled-rejection", 2]
    ]);
  });

  it("reports dropped events and preserves event evidence", () => {
    const contract = normalizeRenderContract({
      runtime: {
        consoleErrors: "warning",
        pageErrors: "off",
        unhandledRejections: "off"
      }
    });

    const findings = inspectRuntime(
      {
        dropped: 3,
        unhandledRejectionCollection: "unavailable",
        events: [
          {
            kind: "console-error",
            message: "failed",
            sequence: 4,
            stack: "stack",
            location: {
              url: "https://example.test/",
              lineNumber: 1,
              columnNumber: 2
            }
          },
          {
            kind: "page-error",
            message: "",
            sequence: 5
          }
        ]
      },
      contract.runtime
    );

    expect(findings).toEqual([
      {
        ruleId: "runtime.console-error",
        severity: "warning",
        message: "failed",
        evidence: {
          sequence: 4,
          stack: "stack",
          location: {
            url: "https://example.test/",
            lineNumber: 1,
            columnNumber: 2
          }
        }
      },
      {
        ruleId: "runtime.dropped-events",
        severity: "error",
        message:
          "3 runtime events were dropped after reaching the observer limit.",
        evidence: { dropped: 3 }
      }
    ]);
  });
});
