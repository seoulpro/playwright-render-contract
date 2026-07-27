import type { Page } from "@playwright/test";

import type { NormalizedRenderContract } from "../contract.js";
import type { RenderFinding, SelectorCondition } from "../types.js";

interface SelectorValidationEntry {
  field: "ready.all" | "ready.none";
  index: number;
  selector: string;
}

async function validateSelectors(
  page: Page,
  contract: NormalizedRenderContract["ready"]
): Promise<void> {
  const entries: SelectorValidationEntry[] = [
    ...contract.all.map((condition, index) => ({
      field: "ready.all" as const,
      index,
      selector: condition.selector
    })),
    ...contract.none.map((condition, index) => ({
      field: "ready.none" as const,
      index,
      selector: condition.selector
    }))
  ];
  if (entries.length === 0) {
    return;
  }

  const invalid = await page.evaluate<
    Pick<SelectorValidationEntry, "field" | "index"> | null,
    SelectorValidationEntry[]
  >((selectors) => {
    for (const entry of selectors) {
      try {
        document.querySelector(entry.selector);
      } catch {
        return {
          field: entry.field,
          index: entry.index
        };
      }
    }
    return null;
  }, entries);

  if (invalid) {
    throw new TypeError(
      `${invalid.field}[${invalid.index}].selector must be valid CSS`
    );
  }
}

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
          state === "attached" ? elements.length > 0 : elements.some(isVisible);
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
      ruleId: required ? "readiness.required" : "readiness.forbidden",
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
  await validateSelectors(page, contract);
  const results = await Promise.all([
    waitForDocument(page, contract.document, contract.timeoutMs),
    ...contract.all.map((condition) =>
      waitForCondition(page, condition, "present", contract.timeoutMs)
    ),
    ...contract.none.map((condition) =>
      waitForCondition(page, condition, "absent", contract.timeoutMs)
    )
  ]);

  return results.filter(
    (finding): finding is RenderFinding => finding !== null
  );
}
