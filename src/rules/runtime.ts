import type { NormalizedRenderContract } from "../contract.js";
import type { RuntimeEvent, RuntimeSnapshot } from "../runtime/collector.js";
import type { FindingSeverity, RenderFinding, Severity } from "../types.js";

function normalizedMessage(value: string): string {
  return value
    .replace(/^Uncaught \(in promise\)\s*/u, "")
    .replace(/^[A-Za-z]*Error:\s*/u, "")
    .trim()
    .toLowerCase();
}

function duplicatePageErrorSequences(
  events: readonly RuntimeEvent[]
): ReadonlySet<number> {
  const unmatchedPageErrors = events.filter(
    (event) => event.kind === "page-error"
  );
  const duplicates = new Set<number>();

  for (const rejection of events) {
    if (rejection.kind !== "unhandled-rejection") {
      continue;
    }
    const rejectionMessage = normalizedMessage(rejection.message);
    if (!rejectionMessage) {
      continue;
    }
    const matchIndex = unmatchedPageErrors.findIndex(
      (event) =>
        Math.abs(event.sequence - rejection.sequence) <= 1 &&
        normalizedMessage(event.message) === rejectionMessage
    );
    if (matchIndex === -1) {
      continue;
    }
    const [duplicate] = unmatchedPageErrors.splice(matchIndex, 1);
    if (duplicate) {
      duplicates.add(duplicate.sequence);
    }
  }

  return duplicates;
}

function matchesIgnore(
  event: RuntimeEvent,
  patterns: readonly (string | RegExp)[]
): boolean {
  const searchable = `${event.message}\n${event.stack ?? ""}`;
  return patterns.some((pattern) => {
    if (typeof pattern === "string") {
      return searchable.includes(pattern);
    }
    const previousLastIndex = pattern.lastIndex;
    try {
      pattern.lastIndex = 0;
      return pattern.test(searchable);
    } finally {
      pattern.lastIndex = previousLastIndex;
    }
  });
}

function findingForEvent(
  event: RuntimeEvent,
  severity: FindingSeverity
): RenderFinding {
  const ruleId = `runtime.${event.kind}`;
  return {
    ruleId,
    severity,
    message: event.message,
    evidence: {
      sequence: event.sequence,
      ...(event.stack ? { stack: event.stack } : {}),
      ...(event.location ? { location: event.location } : {})
    }
  };
}

function enabledSeverity(severity: Severity): FindingSeverity | null {
  return severity === "off" ? null : severity;
}

export function inspectRuntime(
  snapshot: RuntimeSnapshot,
  contract: NormalizedRenderContract["runtime"]
): RenderFinding[] {
  const findings: RenderFinding[] = [];
  if (
    contract.unhandledRejections !== "off" &&
    snapshot.unhandledRejectionCollection === "unavailable"
  ) {
    findings.push({
      ruleId: "runtime.unhandled-rejection-audit-unavailable",
      severity: "error",
      message:
        "Unhandled promise rejection auditing is unavailable for this page.",
      evidence: {
        configuredSeverity: contract.unhandledRejections
      }
    });
  }
  const duplicatePageErrors = duplicatePageErrorSequences(snapshot.events);

  for (const event of snapshot.events) {
    if (
      matchesIgnore(event, contract.ignore) ||
      (event.kind === "page-error" && duplicatePageErrors.has(event.sequence))
    ) {
      continue;
    }

    const configured =
      event.kind === "page-error"
        ? contract.pageErrors
        : event.kind === "console-error"
          ? contract.consoleErrors
          : contract.unhandledRejections;
    const severity = enabledSeverity(configured);
    if (severity) {
      findings.push(findingForEvent(event, severity));
    }
  }

  if (snapshot.dropped > 0) {
    findings.push({
      ruleId: "runtime.dropped-events",
      severity: "error",
      message: `${snapshot.dropped} runtime events were dropped after reaching the observer limit.`,
      evidence: { dropped: snapshot.dropped }
    });
  }
  return findings;
}
