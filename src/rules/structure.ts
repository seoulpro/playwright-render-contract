import type { Page } from "@playwright/test";

import type {
  NormalizedCountContract,
  NormalizedRenderContract
} from "../contract.js";
import type { FindingSeverity, RenderFinding } from "../types.js";

interface StructureSnapshot {
  mainCount: number;
  visibleH1Count: number;
  duplicateIds: readonly {
    id: string;
    count: number;
    selector?: string;
    truncated: boolean;
  }[];
  duplicateIdsOmitted: number;
  idElementsSeen: number;
  idScanTruncated: boolean;
  trackedIds: number;
}

export interface StructureInspectionLimits {
  maxTrackedIds: number;
  maxDuplicateIdFindings: number;
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
  contract: NormalizedRenderContract["structure"],
  limits: StructureInspectionLimits
): Promise<RenderFinding[]> {
  const snapshot = await page.evaluate<
    StructureSnapshot,
    {
      checkUniqueIds: boolean;
      maxTrackedIds: number;
      maxDuplicateIdFindings: number;
    }
  >(
    ({ checkUniqueIds, maxTrackedIds, maxDuplicateIdFindings }) => {
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
      let idElementsSeen = 0;
      let idScanTruncated = false;
      if (checkUniqueIds) {
        for (const element of document.querySelectorAll("[id]")) {
          idElementsSeen += 1;
          const previous = idCounts.get(element.id);
          if (previous !== undefined) {
            idCounts.set(element.id, previous + 1);
          } else if (idCounts.size < maxTrackedIds) {
            idCounts.set(element.id, 1);
          } else {
            idScanTruncated = true;
          }
        }
      }
      const allDuplicateIds = [...idCounts.entries()]
        .filter(([, count]) => count > 1)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
      const duplicateIds = allDuplicateIds
        .slice(0, maxDuplicateIdFindings)
        .map(([id, count]) => {
          const truncated = id.length > 500;
          return {
            id: truncated ? `${id.slice(0, 499)}…` : id,
            count,
            truncated,
            ...(truncated ? {} : { selector: `[id="${CSS.escape(id)}"]` })
          };
        });

      return {
        mainCount: document.querySelectorAll("main").length,
        visibleH1Count: Array.from(document.querySelectorAll("h1")).filter(
          isVisible
        ).length,
        duplicateIds,
        duplicateIdsOmitted: allDuplicateIds.length - duplicateIds.length,
        idElementsSeen,
        idScanTruncated,
        trackedIds: idCounts.size
      };
    },
    {
      checkUniqueIds: contract.uniqueIds !== "off",
      maxTrackedIds: limits.maxTrackedIds,
      maxDuplicateIdFindings: limits.maxDuplicateIdFindings
    }
  );

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
      const { selector, ...evidence } = duplicate;
      findings.push({
        ruleId: "structure.unique-id",
        severity: uniqueIdSeverity,
        message: `ID "${duplicate.id}" is used ${duplicate.count} times.`,
        ...(selector ? { selector } : {}),
        evidence
      });
    }
    if (snapshot.idScanTruncated || snapshot.duplicateIdsOmitted > 0) {
      findings.push({
        ruleId: "structure.id-audit-limit",
        severity: "error",
        message:
          "The duplicate-ID audit reached its configured collection limit.",
        selector: "[id]",
        evidence: {
          idElementsSeen: snapshot.idElementsSeen,
          trackedIds: snapshot.trackedIds,
          maxTrackedIds: limits.maxTrackedIds,
          reportedDuplicateIds: snapshot.duplicateIds.length,
          duplicateIdsOmitted: snapshot.duplicateIdsOmitted,
          maxDuplicateIdFindings: limits.maxDuplicateIdFindings,
          idScanTruncated: snapshot.idScanTruncated
        }
      });
    }
  }
  return findings;
}
