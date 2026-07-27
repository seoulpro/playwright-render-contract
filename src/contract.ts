import type {
  CountContract,
  RenderContract,
  SelectorCondition,
  Severity
} from "./types.js";

export interface NormalizedCountContract {
  min: number;
  max: number | null;
}

export interface NormalizedRenderContract {
  ready: {
    document: "interactive" | "complete";
    all: readonly Required<SelectorCondition>[];
    none: readonly Required<SelectorCondition>[];
    timeoutMs: number;
  };
  runtime: {
    pageErrors: Severity;
    consoleErrors: Severity;
    unhandledRejections: Severity;
    ignore: readonly (string | RegExp)[];
  };
  structure: {
    main: NormalizedCountContract;
    visibleH1: NormalizedCountContract;
    uniqueIds: Severity;
  };
  viewport: {
    horizontalOverflow: Severity;
    tolerancePx: number;
  };
}

function normalizeSeverity(
  severity: Severity | undefined,
  fallback: Severity
): Severity {
  return severity ?? fallback;
}

function normalizeCount(
  value: CountContract | undefined,
  defaults: NormalizedCountContract
): NormalizedCountContract {
  if (value === undefined) {
    return defaults;
  }
  const min = value.min ?? 0;
  const max = value.max ?? null;
  if (!Number.isInteger(min) || min < 0) {
    throw new TypeError("structure count min must be a non-negative integer");
  }
  if (
    max !== null &&
    (!Number.isInteger(max) || max < min)
  ) {
    throw new TypeError(
      "structure count max must be an integer greater than or equal to min"
    );
  }
  return { min, max };
}

function normalizeConditions(
  conditions: readonly SelectorCondition[] | undefined
): readonly Required<SelectorCondition>[] {
  return (conditions ?? []).map((condition) => {
    if (!condition.selector.trim()) {
      throw new TypeError("readiness selectors must not be empty");
    }
    return {
      selector: condition.selector,
      state: condition.state ?? "visible"
    };
  });
}

export function normalizeRenderContract(
  contract: RenderContract = {}
): NormalizedRenderContract {
  const timeoutMs = contract.ready?.timeoutMs ?? 5_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
    throw new TypeError("ready.timeoutMs must be a non-negative number");
  }

  const tolerancePx = contract.viewport?.tolerancePx ?? 1;
  if (!Number.isFinite(tolerancePx) || tolerancePx < 0) {
    throw new TypeError(
      "viewport.tolerancePx must be a non-negative number"
    );
  }

  return {
    ready: {
      document: contract.ready?.document ?? "complete",
      all: normalizeConditions(contract.ready?.all),
      none: normalizeConditions(contract.ready?.none),
      timeoutMs
    },
    runtime: {
      pageErrors: normalizeSeverity(
        contract.runtime?.pageErrors,
        "error"
      ),
      consoleErrors: normalizeSeverity(
        contract.runtime?.consoleErrors,
        "error"
      ),
      unhandledRejections: normalizeSeverity(
        contract.runtime?.unhandledRejections,
        "error"
      ),
      ignore: contract.runtime?.ignore ?? []
    },
    structure: {
      main: normalizeCount(contract.structure?.main, {
        min: 1,
        max: 1
      }),
      visibleH1: normalizeCount(contract.structure?.visibleH1, {
        min: 1,
        max: 1
      }),
      uniqueIds: normalizeSeverity(
        contract.structure?.uniqueIds,
        "error"
      )
    },
    viewport: {
      horizontalOverflow: normalizeSeverity(
        contract.viewport?.horizontalOverflow,
        "error"
      ),
      tolerancePx
    }
  };
}

export function defineRenderContract<const T extends RenderContract>(
  value: T
): T {
  return value;
}

