import type { Page } from "@playwright/test";

import type { NormalizedRenderContract } from "../contract.js";
import type {
  RenderFinding,
  SelectorCondition
} from "../types.js";

async function waitForDocument(
  page: Page,
  documentState: "interactive" | "complete",
  timeoutMs: number
): Promise<RenderFinding | null> {
  try {
    await page.waitForFunction(
      (expected) =>
        document.readyState === expected ||
        (expected === "interactive" && document.readyState === "complete"),
      documentState,
      { timeout: timeoutMs }
    );
    return null;
  } catch {
    return {
      ruleId: "readiness.document",
      severity: "error",
      message: `Document did not reach ${documentState} within ${timeoutMs}ms.`,
      evidence: {
        expected: documentState,
        timeoutMs
      }
    };
  }
}

async function waitForCondition(
  page: Page,
  condition: Required<SelectorCondition>,
  expected: "present" | "absent",
  timeoutMs: number
): Promise<RenderFinding | null> {
  try {
    await page.waitForFunction(
      ({ selector, state, expectedState }) => {
        const elements = Array.from(document.querySelectorAll(selector));
        const isVisible = (element: Element): boolean => {
          const style = window.getComputedStyle(element);
          if (
            style.display === "none" ||
            style.visibility === "hidden" ||
            style.visibility === "collapse"
          ) {
            return false;
          }
          const rectangle = element.getBoundingClientRect();
          return rectangle.width > 0 && rectangle.height > 0;
        };
        const matches =
          state === "attached"
            ? elements.length > 0
            : elements.some(isVisible);
        return expectedState === "present" ? matches : !matches;
      },
      {
        selector: condition.selector,
        state: condition.state,
        expectedState: expected
      },
      { timeout: timeoutMs }
    );
    return null;
  } catch {
    const required = expected === "present";
    return {
      ruleId: required
        ? "readiness.required"
        : "readiness.forbidden",
      severity: "error",
      message: required
        ? `Required ${condition.state} selector did not appear within ${timeoutMs}ms.`
        : `Forbidden ${condition.state} selector remained after ${timeoutMs}ms.`,
      selector: condition.selector,
      evidence: {
        expected,
        state: condition.state,
        timeoutMs
      }
    };
  }
}

export async function inspectReadiness(
  page: Page,
  contract: NormalizedRenderContract["ready"]
): Promise<RenderFinding[]> {
  const results = await Promise.all([
    waitForDocument(page, contract.document, contract.timeoutMs),
    ...contract.all.map((condition) =>
      waitForCondition(
        page,
        condition,
        "present",
        contract.timeoutMs
      )
    ),
    ...contract.none.map((condition) =>
      waitForCondition(
        page,
        condition,
        "absent",
        contract.timeoutMs
      )
    )
  ]);

  return results.filter(
    (finding): finding is RenderFinding => finding !== null
  );
}

