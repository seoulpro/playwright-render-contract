import type { Page } from "@playwright/test";

import type { NormalizedRenderContract } from "../contract.js";
import type {
  FindingSeverity,
  RenderFinding
} from "../types.js";

interface OverflowSnapshot {
  clientWidth: number;
  scrollWidth: number;
  overflowPx: number;
}

export async function inspectViewport(
  page: Page,
  contract: NormalizedRenderContract["viewport"]
): Promise<RenderFinding[]> {
  if (contract.horizontalOverflow === "off") {
    return [];
  }

  const snapshot = await page.evaluate<OverflowSnapshot>(() => {
    const root = document.documentElement;
    const body = document.body;
    const clientWidth = root.clientWidth || window.innerWidth;
    const scrollWidth = Math.max(
      root.scrollWidth,
      body?.scrollWidth ?? 0,
      clientWidth
    );
    return {
      clientWidth,
      scrollWidth,
      overflowPx: Math.max(0, scrollWidth - clientWidth)
    };
  });

  if (snapshot.overflowPx <= contract.tolerancePx) {
    return [];
  }

  return [
    {
      ruleId: "viewport.horizontal-overflow",
      severity: contract.horizontalOverflow as FindingSeverity,
      message: `Document is ${snapshot.overflowPx}px wider than the viewport.`,
      selector: "html",
      evidence: {
        ...snapshot,
        tolerancePx: contract.tolerancePx
      }
    }
  ];
}

