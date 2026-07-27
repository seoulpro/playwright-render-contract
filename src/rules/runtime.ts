import type { NormalizedRenderContract } from "../contract.js";
import type {
  RuntimeEvent,
  RuntimeSnapshot
} from "../runtime/collector.js";
import type {
  FindingSeverity,
  RenderFinding,
  Severity
} from "../types.js";

function normalizedMessage(value: string): string {
  return value
    .replace(/^Uncaught \(in promise\)\s*/u, "")
    .replace(/^[A-Za-z]*Error:\s*/u, "")
    .trim()
    .toLowerCase();
}

function isDuplicatePageError(
  event: RuntimeEvent,
  rejections: readonly RuntimeEvent[]
): boolean {
  const pageMessage = normalizedMessage(event.message);
  return rejections.some((rejection) => {
    const rejectionMessage = normalizedMessage(rejection.message);
    return (
      pageMessage === rejectionMessage ||
      pageMessage.includes(rejectionMessage) ||
      rejectionMessage.includes(pageMessage)
    );
  });
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
    pattern.lastIndex = 0;
    return pattern.test(searchable);
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

function enabledSeverity(
  severity: Severity
): FindingSeverity | null {
  return severity === "off" ? null : severity;
}

export function inspectRuntime(
  snapshot: RuntimeSnapshot,
  contract: NormalizedRenderContract["runtime"]
): RenderFinding[] {
  const findings: RenderFinding[] = [];
  const rejections = snapshot.events.filter(
    (event) => event.kind === "unhandled-rejection"
  );

  for (const event of snapshot.events) {
    if (
      matchesIgnore(event, contract.ignore) ||
      (event.kind === "page-error" &&
        isDuplicatePageError(event, rejections))
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

