import type { Page } from "@playwright/test";

export type Severity = "off" | "warning" | "error";
export type FindingSeverity = Exclude<Severity, "off">;

export interface SelectorCondition {
  selector: string;
  state?: "attached" | "visible";
}

export interface CountContract {
  min?: number;
  max?: number;
}

export interface RenderContract {
  ready?: {
    document?: "interactive" | "complete";
    all?: readonly SelectorCondition[];
    none?: readonly SelectorCondition[];
    timeoutMs?: number;
  };
  runtime?: {
    pageErrors?: Severity;
    consoleErrors?: Severity;
    unhandledRejections?: Severity;
    ignore?: readonly (string | RegExp)[];
  };
  structure?: {
    main?: CountContract;
    visibleH1?: CountContract;
    uniqueIds?: Severity;
  };
  viewport?: {
    horizontalOverflow?: Severity;
    tolerancePx?: number;
  };
}

export interface RenderFinding {
  ruleId: string;
  severity: FindingSeverity;
  message: string;
  selector?: string;
  evidence: Readonly<Record<string, unknown>>;
}

export interface RenderReport {
  ok: boolean;
  url: string;
  title: string;
  viewport: { width: number; height: number } | null;
  findings: readonly RenderFinding[];
}

export interface ObserverOptions {
  /**
   * Bounds memory use if a broken page emits the same error continuously.
   * Additional events are summarized in the report.
   */
  maxRuntimeEvents?: number;
  /**
   * Defaults to `origin-and-path`, which removes query strings and fragments
   * from report URLs. Use `full` only when artifacts may safely retain them.
   */
  urlPolicy?:
    | "origin-and-path"
    | "full"
    | ((url: string) => string);
}

export interface RenderObserver {
  readonly page: Page;
  readonly disposed: boolean;
  inspect(contract?: RenderContract): Promise<RenderReport>;
  dispose(): Promise<void>;
}
