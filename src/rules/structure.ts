import type { Page } from "@playwright/test";

import type {
  NormalizedCountContract,
  NormalizedRenderContract
} from "../contract.js";
import type {
  FindingSeverity,
  RenderFinding
} from "../types.js";

interface StructureSnapshot {
  mainCount: number;
  visibleH1Count: number;
  duplicateIds: readonly { id: string; count: number }[];
}

function countFinding(
  ruleId: string,
  label: string,
  selector: string,
  actual: number,
  expected: NormalizedCountContract
): RenderFinding | null {
  const tooFew = actual < expected.min;
  const tooMany = expected.max !== null && actual > expected.max;
  if (!tooFew && !tooMany) {
    return null;
  }

  const range =
    expected.max === null
      ? `at least ${expected.min}`
      : expected.min === expected.max
        ? `exactly ${expected.min}`
        : `${expected.min}–${expected.max}`;
  return {
    ruleId,
    severity: "error",
    message: `Expected ${range} ${label}; found ${actual}.`,
    selector,
    evidence: {
      actual,
      min: expected.min,
      ...(expected.max === null ? {} : { max: expected.max })
    }
  };
}

export async function inspectStructure(
  page: Page,
  contract: NormalizedRenderContract["structure"]
): Promise<RenderFinding[]> {
  const snapshot = await page.evaluate<StructureSnapshot>(() => {
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

    const idCounts = new Map<string, number>();
    for (const element of document.querySelectorAll("[id]")) {
      idCounts.set(element.id, (idCounts.get(element.id) ?? 0) + 1);
    }

    return {
      mainCount: document.querySelectorAll("main").length,
      visibleH1Count: Array.from(
        document.querySelectorAll("h1")
      ).filter(isVisible).length,
      duplicateIds: [...idCounts.entries()]
        .filter(([, count]) => count > 1)
        .map(([id, count]) => ({ id, count }))
        .sort((left, right) => left.id.localeCompare(right.id))
    };
  });

  const findings: RenderFinding[] = [];
  const mainFinding = countFinding(
    "structure.main",
    "<main> elements",
    "main",
    snapshot.mainCount,
    contract.main
  );
  if (mainFinding) {
    findings.push(mainFinding);
  }

  const headingFinding = countFinding(
    "structure.visible-h1",
    "visible H1 elements",
    "h1",
    snapshot.visibleH1Count,
    contract.visibleH1
  );
  if (headingFinding) {
    findings.push(headingFinding);
  }

  const uniqueIdSeverity: FindingSeverity | null =
    contract.uniqueIds === "off" ? null : contract.uniqueIds;
  if (uniqueIdSeverity) {
    for (const duplicate of snapshot.duplicateIds) {
      findings.push({
        ruleId: "structure.unique-id",
        severity: uniqueIdSeverity,
        message: `ID "${duplicate.id}" is used ${duplicate.count} times.`,
        selector: `[id=${JSON.stringify(duplicate.id)}]`,
        evidence: duplicate
      });
    }
  }
  return findings;
}

