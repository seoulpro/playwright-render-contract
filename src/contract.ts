import type {
  CountContract,
  RenderContract,
  SelectorCondition,
  Severity
} from "./types.js";

const MAX_SELECTOR_LENGTH = 2_048;

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

function normalizeObject<T extends object>(
  value: T | undefined,
  field: string,
  allowedKeys: readonly string[]
): T {
  if (value === undefined) {
    return {} as T;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${field} must be an object`);
  }
  const normalized = { ...value };
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(normalized)) {
    if (!allowed.has(key)) {
      throw new TypeError(`unknown ${field} field: ${key}`);
    }
  }
  return normalized;
}

function normalizeSeverity(
  severity: Severity | undefined,
  fallback: Severity,
  field: string
): Severity {
  const normalized = severity ?? fallback;
  if (
    normalized !== "off" &&
    normalized !== "warning" &&
    normalized !== "error"
  ) {
    throw new TypeError(`${field} must be "off", "warning", or "error"`);
  }
  return normalized;
}

function normalizeCount(
  value: CountContract | undefined,
  defaults: NormalizedCountContract,
  field: string
): NormalizedCountContract {
  if (value === undefined) {
    return defaults;
  }
  const normalized = normalizeObject(value, field, ["min", "max"]);
  const min = normalized.min ?? 0;
  const max = normalized.max ?? null;
  if (!Number.isInteger(min) || min < 0) {
    throw new TypeError(`${field}.min must be a non-negative integer`);
  }
  if (max !== null && (!Number.isInteger(max) || max < min)) {
    throw new TypeError(
      `${field}.max must be an integer greater than or equal to min`
    );
  }
  return { min, max };
}

function normalizeConditions(
  conditions: readonly SelectorCondition[] | undefined,
  field: string
): readonly Required<SelectorCondition>[] {
  if (conditions !== undefined && !Array.isArray(conditions)) {
    throw new TypeError(`${field} must be an array`);
  }
  return (conditions ?? []).map((condition) => {
    if (
      typeof condition !== "object" ||
      condition === null ||
      typeof condition.selector !== "string"
    ) {
      throw new TypeError(
        `each ${field} condition must have a selector string`
      );
    }
    const normalized = normalizeObject(condition, `${field} condition`, [
      "selector",
      "state"
    ]);
    if (!normalized.selector.trim()) {
      throw new TypeError("readiness selectors must not be empty");
    }
    if (normalized.selector.length > MAX_SELECTOR_LENGTH) {
      throw new TypeError(
        `readiness selectors must not exceed ${MAX_SELECTOR_LENGTH} characters`
      );
    }
    const state = normalized.state ?? "visible";
    if (state !== "attached" && state !== "visible") {
      throw new TypeError(
        'readiness condition state must be "attached" or "visible"'
      );
    }
    return {
      selector: normalized.selector,
      state
    };
  });
}

export function normalizeRenderContract(
  contract: RenderContract = {}
): NormalizedRenderContract {
  const normalizedContract = normalizeObject(contract, "render contract", [
    "ready",
    "runtime",
    "structure",
    "viewport"
  ]);
  const ready = normalizeObject(normalizedContract.ready, "ready", [
    "document",
    "all",
    "none",
    "timeoutMs"
  ]);
  const runtime = normalizeObject(normalizedContract.runtime, "runtime", [
    "pageErrors",
    "consoleErrors",
    "unhandledRejections",
    "ignore"
  ]);
  const structure = normalizeObject(normalizedContract.structure, "structure", [
    "main",
    "visibleH1",
    "uniqueIds"
  ]);
  const viewport = normalizeObject(normalizedContract.viewport, "viewport", [
    "horizontalOverflow",
    "tolerancePx"
  ]);

  const timeoutMs = ready.timeoutMs ?? 5_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError("ready.timeoutMs must be a positive number");
  }

  const tolerancePx = viewport.tolerancePx ?? 1;
  if (!Number.isFinite(tolerancePx) || tolerancePx < 0) {
    throw new TypeError("viewport.tolerancePx must be a non-negative number");
  }

  const documentState = ready.document ?? "complete";
  if (documentState !== "interactive" && documentState !== "complete") {
    throw new TypeError('ready.document must be "interactive" or "complete"');
  }

  const ignore = runtime.ignore ?? [];
  if (
    !Array.isArray(ignore) ||
    ignore.some(
      (pattern) => typeof pattern !== "string" && !(pattern instanceof RegExp)
    )
  ) {
    throw new TypeError(
      "runtime.ignore must contain only strings and regular expressions"
    );
  }

  return {
    ready: {
      document: documentState,
      all: normalizeConditions(ready.all, "ready.all"),
      none: normalizeConditions(ready.none, "ready.none"),
      timeoutMs
    },
    runtime: {
      pageErrors: normalizeSeverity(
        runtime.pageErrors,
        "error",
        "runtime.pageErrors"
      ),
      consoleErrors: normalizeSeverity(
        runtime.consoleErrors,
        "error",
        "runtime.consoleErrors"
      ),
      unhandledRejections: normalizeSeverity(
        runtime.unhandledRejections,
        "error",
        "runtime.unhandledRejections"
      ),
      ignore: [...ignore]
    },
    structure: {
      main: normalizeCount(
        structure.main,
        { min: 1, max: 1 },
        "structure.main"
      ),
      visibleH1: normalizeCount(
        structure.visibleH1,
        { min: 1, max: 1 },
        "structure.visibleH1"
      ),
      uniqueIds: normalizeSeverity(
        structure.uniqueIds,
        "error",
        "structure.uniqueIds"
      )
    },
    viewport: {
      horizontalOverflow: normalizeSeverity(
        viewport.horizontalOverflow,
        "error",
        "viewport.horizontalOverflow"
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
