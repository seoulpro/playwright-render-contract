import type { Page } from "@playwright/test";

import { normalizeRenderContract } from "./contract.js";
import { sortFindings } from "./report.js";
import { RuntimeCollector, type RuntimeSnapshot } from "./runtime/collector.js";
import { inspectReadiness } from "./rules/readiness.js";
import { inspectRuntime } from "./rules/runtime.js";
import { inspectStructure } from "./rules/structure.js";
import type { StructureInspectionLimits } from "./rules/structure.js";
import { inspectViewport } from "./rules/viewport.js";
import { applyReportUrlPolicy, defaultReportUrlPolicy } from "./url.js";
import type {
  ObserverOptions,
  RenderContract,
  RenderObserver,
  RenderReport
} from "./types.js";

class PageRenderObserver implements RenderObserver {
  readonly page: Page;
  readonly #runtime: RuntimeCollector;
  readonly #formatUrl: (url: string) => string;
  readonly #structureLimits: StructureInspectionLimits;
  #disposed = false;

  constructor(
    page: Page,
    runtime: RuntimeCollector,
    formatUrl: (url: string) => string,
    structureLimits: StructureInspectionLimits
  ) {
    this.page = page;
    this.#runtime = runtime;
    this.#formatUrl = formatUrl;
    this.#structureLimits = structureLimits;
  }

  get disposed(): boolean {
    return this.#disposed;
  }

  async inspect(contract: RenderContract = {}): Promise<RenderReport> {
    if (this.#disposed) {
      throw new Error("Cannot inspect with a disposed render observer");
    }

    const normalized = normalizeRenderContract(contract);
    const readinessFindings = await inspectReadiness(
      this.page,
      normalized.ready
    );
    const [structureFindings, viewportFindings] = await Promise.all([
      inspectStructure(this.page, normalized.structure, this.#structureLimits),
      inspectViewport(this.page, normalized.viewport)
    ]);

    // This protocol round trip lets already-queued browser events reach the
    // collector without introducing an arbitrary time-based sleep.
    await this.page.evaluate(() => Promise.resolve());
    await this.#runtime.flush();
    const rawRuntimeSnapshot = this.#runtime.snapshot();
    const runtimeSnapshot: RuntimeSnapshot = {
      ...rawRuntimeSnapshot,
      events: rawRuntimeSnapshot.events.map((event) => ({
        ...event,
        ...(event.location
          ? {
              location: {
                ...event.location,
                url: this.#formatUrl(event.location.url)
              }
            }
          : {})
      }))
    };
    const runtimeFindings = inspectRuntime(runtimeSnapshot, normalized.runtime);
    const findings = sortFindings([
      ...readinessFindings,
      ...runtimeFindings,
      ...structureFindings,
      ...viewportFindings
    ]);

    const [rawTitle, rawUrl] = await Promise.all([
      this.page.title(),
      Promise.resolve(this.page.url())
    ]);
    const title =
      rawTitle.length <= 500 ? rawTitle : `${rawTitle.slice(0, 499)}…`;
    const url = this.#formatUrl(rawUrl);
    const viewport = this.page.viewportSize();

    return {
      ok: !findings.some((finding) => finding.severity === "error"),
      url,
      title,
      viewport,
      findings
    };
  }

  async dispose(): Promise<void> {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    await this.#runtime.dispose();
  }
}

export async function observePage(
  page: Page,
  options: ObserverOptions = {}
): Promise<RenderObserver> {
  if (
    typeof options !== "object" ||
    options === null ||
    Array.isArray(options)
  ) {
    throw new TypeError("observer options must be an object");
  }
  for (const key of Object.keys(options)) {
    if (
      key !== "maxRuntimeEvents" &&
      key !== "maxTrackedIds" &&
      key !== "maxDuplicateIdFindings" &&
      key !== "urlPolicy"
    ) {
      throw new TypeError(`unknown observer option: ${key}`);
    }
  }
  const maxRuntimeEvents = options.maxRuntimeEvents ?? 1_000;
  if (!Number.isInteger(maxRuntimeEvents) || maxRuntimeEvents <= 0) {
    throw new TypeError("maxRuntimeEvents must be a positive integer");
  }
  const maxTrackedIds = options.maxTrackedIds ?? 10_000;
  if (!Number.isInteger(maxTrackedIds) || maxTrackedIds <= 0) {
    throw new TypeError("maxTrackedIds must be a positive integer");
  }
  const maxDuplicateIdFindings = options.maxDuplicateIdFindings ?? 100;
  if (
    !Number.isInteger(maxDuplicateIdFindings) ||
    maxDuplicateIdFindings <= 0
  ) {
    throw new TypeError("maxDuplicateIdFindings must be a positive integer");
  }
  if (
    options.urlPolicy !== undefined &&
    options.urlPolicy !== "origin-and-path" &&
    options.urlPolicy !== "full" &&
    typeof options.urlPolicy !== "function"
  ) {
    throw new TypeError(
      'urlPolicy must be "origin-and-path", "full", or a function'
    );
  }
  const redactUrl =
    typeof options.urlPolicy === "function"
      ? options.urlPolicy
      : options.urlPolicy === "full"
        ? (url: string): string => url
        : defaultReportUrlPolicy;
  const formatUrl = (url: string): string =>
    applyReportUrlPolicy(url, redactUrl);
  const runtime = await RuntimeCollector.create(page, maxRuntimeEvents);
  return new PageRenderObserver(page, runtime, formatUrl, {
    maxTrackedIds,
    maxDuplicateIdFindings
  });
}
