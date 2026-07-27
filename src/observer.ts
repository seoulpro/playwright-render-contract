import type { Page } from "@playwright/test";

import { normalizeRenderContract } from "./contract.js";
import { sortFindings } from "./report.js";
import {
  RuntimeCollector,
  type RuntimeSnapshot
} from "./runtime/collector.js";
import { inspectReadiness } from "./rules/readiness.js";
import { inspectRuntime } from "./rules/runtime.js";
import { inspectStructure } from "./rules/structure.js";
import { inspectViewport } from "./rules/viewport.js";
import type {
  ObserverOptions,
  RenderContract,
  RenderObserver,
  RenderReport
} from "./types.js";

class PageRenderObserver implements RenderObserver {
  readonly page: Page;
  readonly #runtime: RuntimeCollector;
  readonly #redactUrl: (url: string) => string;
  #disposed = false;

  constructor(
    page: Page,
    runtime: RuntimeCollector,
    redactUrl: (url: string) => string
  ) {
    this.page = page;
    this.#runtime = runtime;
    this.#redactUrl = redactUrl;
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
      inspectStructure(this.page, normalized.structure),
      inspectViewport(this.page, normalized.viewport)
    ]);

    // This protocol round trip lets already-queued browser events reach the
    // collector without introducing an arbitrary time-based sleep.
    await this.page.evaluate(() => Promise.resolve());
    const rawRuntimeSnapshot = this.#runtime.snapshot();
    const runtimeSnapshot: RuntimeSnapshot = {
      ...rawRuntimeSnapshot,
      events: rawRuntimeSnapshot.events.map((event) => ({
        ...event,
        ...(event.location
          ? {
              location: {
                ...event.location,
                url: this.#redactUrl(event.location.url)
              }
            }
          : {})
      }))
    };
    const runtimeFindings = inspectRuntime(
      runtimeSnapshot,
      normalized.runtime
    );
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
    const url = this.#redactUrl(rawUrl);
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
  const maxRuntimeEvents = options.maxRuntimeEvents ?? 1_000;
  if (!Number.isInteger(maxRuntimeEvents) || maxRuntimeEvents <= 0) {
    throw new TypeError(
      "maxRuntimeEvents must be a positive integer"
    );
  }
  const defaultRedactor = (url: string): string => {
    try {
      const parsed = new URL(url);
      parsed.search = "";
      parsed.hash = "";
      return parsed.toString();
    } catch {
      return url.split(/[?#]/u, 1)[0] ?? "";
    }
  };
  const redactUrl =
    typeof options.urlPolicy === "function"
      ? options.urlPolicy
      : options.urlPolicy === "full"
        ? (url: string): string => url
        : defaultRedactor;
  const runtime = await RuntimeCollector.create(page, maxRuntimeEvents);
  return new PageRenderObserver(page, runtime, redactUrl);
}
