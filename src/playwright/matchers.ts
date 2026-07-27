import type {
  ExpectMatcherState,
  MatcherReturnType
} from "@playwright/test";

import { formatRenderReport } from "../report.js";
import type {
  RenderContract,
  RenderObserver
} from "../types.js";

function isRenderObserver(value: unknown): value is RenderObserver {
  return (
    typeof value === "object" &&
    value !== null &&
    "inspect" in value &&
    typeof (value as { inspect?: unknown }).inspect === "function" &&
    "dispose" in value &&
    typeof (value as { dispose?: unknown }).dispose === "function"
  );
}

async function toPassRenderContract(
  this: ExpectMatcherState,
  received: unknown,
  contract: RenderContract = {}
): Promise<MatcherReturnType> {
  if (!isRenderObserver(received)) {
    return {
      pass: false,
      message: () =>
        "toPassRenderContract expects an observer returned by observePage()."
    };
  }

  const report = await received.inspect(contract);
  return {
    pass: report.ok,
    actual: report,
    message: () =>
      report.ok
        ? "Expected the render contract not to pass, but it had no error findings."
        : formatRenderReport(report)
  };
}

export const renderContractMatchers = {
  toPassRenderContract
};

declare global {
  namespace PlaywrightTest {
    interface Matchers<R, T = unknown> {
      toPassRenderContract(contract?: RenderContract): Promise<R>;
    }
  }
}

