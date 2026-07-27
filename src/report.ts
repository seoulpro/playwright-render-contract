import type { TestInfo } from "@playwright/test";

import type { RenderFinding, RenderReport } from "./types.js";

const RULE_ORDER = [
  "readiness.document",
  "readiness.required",
  "readiness.forbidden",
  "runtime.page-error",
  "runtime.unhandled-rejection",
  "runtime.unhandled-rejection-audit-unavailable",
  "runtime.console-error",
  "runtime.dropped-events",
  "structure.main",
  "structure.visible-h1",
  "structure.unique-id",
  "structure.id-audit-limit",
  "viewport.horizontal-overflow"
] as const;

const ruleRank = new Map<string, number>(
  RULE_ORDER.map((rule, index) => [rule, index])
);
const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

export function sortFindings(
  findings: readonly RenderFinding[]
): RenderFinding[] {
  return [...findings].sort((left, right) => {
    const rankDifference =
      (ruleRank.get(left.ruleId) ?? Number.MAX_SAFE_INTEGER) -
      (ruleRank.get(right.ruleId) ?? Number.MAX_SAFE_INTEGER);
    return (
      rankDifference ||
      compareText(left.selector ?? "", right.selector ?? "") ||
      compareText(left.message, right.message)
    );
  });
}

function markdownCell(value: string, limit = 1_000): string {
  const normalized = value
    .replace(/\s+/gu, " ")
    .replace(/\p{Cc}/gu, "�")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\\", "\\\\")
    .replaceAll("|", "\\|")
    .replaceAll("[", "\\[")
    .replaceAll("]", "\\]")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)")
    .replaceAll("!", "\\!")
    .trim();
  return normalized.length <= limit
    ? normalized
    : `${normalized.slice(0, limit - 1)}…`;
}

export function formatRenderReport(report: RenderReport): string {
  const lines = [
    "# Render contract report",
    "",
    `- Result: ${report.ok ? "pass" : "fail"}`,
    `- URL: ${report.url ? markdownCell(report.url, 2_048) : "(empty)"}`,
    `- Title: ${report.title ? markdownCell(report.title, 500) : "(empty)"}`,
    `- Viewport: ${
      report.viewport
        ? `${report.viewport.width}×${report.viewport.height}`
        : "unknown"
    }`,
    `- Findings: ${report.findings.length}`,
    ""
  ];

  if (report.findings.length === 0) {
    lines.push("No findings.", "");
    return lines.join("\n");
  }

  lines.push("| Severity | Rule | Selector | Message |", "|---|---|---|---|");
  for (const finding of report.findings) {
    lines.push(
      `| ${finding.severity} | ${markdownCell(
        finding.ruleId
      )} | ${markdownCell(finding.selector ?? "")} | ${markdownCell(
        finding.message
      )} |`
    );
  }
  lines.push("");
  return lines.join("\n");
}

export async function attachRenderReport(
  report: RenderReport,
  testInfo: TestInfo
): Promise<void> {
  await testInfo.attach("render-contract.json", {
    body: JSON.stringify(report, null, 2),
    contentType: "application/json"
  });
  await testInfo.attach("render-contract.md", {
    body: formatRenderReport(report),
    contentType: "text/markdown"
  });
}
