import type { CDPSession, ConsoleMessage, Page } from "@playwright/test";

export type RuntimeEventKind =
  | "page-error"
  | "console-error"
  | "unhandled-rejection";

export interface RuntimeEvent {
  kind: RuntimeEventKind;
  message: string;
  sequence: number;
  stack?: string;
  location?: {
    url: string;
    lineNumber: number;
    columnNumber: number;
  };
}

export interface RuntimeSnapshot {
  events: readonly RuntimeEvent[];
  dropped: number;
  unhandledRejectionCollection: "supported" | "unavailable";
}

interface CdpExceptionDetails {
  text?: unknown;
  exception?: {
    description?: unknown;
    value?: unknown;
  };
  stackTrace?: unknown;
}

function truncate(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;
}

function asExceptionDetails(payload: unknown): CdpExceptionDetails | null {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("exceptionDetails" in payload)
  ) {
    return null;
  }
  const details = (payload as { exceptionDetails?: unknown }).exceptionDetails;
  return typeof details === "object" && details !== null
    ? (details as CdpExceptionDetails)
    : null;
}

function rejectionFromCdp(payload: unknown): {
  message: string;
  stack?: string;
} | null {
  const details = asExceptionDetails(payload);
  if (!details) {
    return null;
  }

  const text = typeof details.text === "string" ? details.text : "";
  const description =
    typeof details.exception?.description === "string"
      ? details.exception.description
      : "";
  if (
    !text.toLowerCase().includes("promise") &&
    !description.toLowerCase().includes("uncaught (in promise)")
  ) {
    return null;
  }

  const rawMessage =
    description ||
    (typeof details.exception?.value === "string"
      ? details.exception.value
      : text);
  const firstLine = rawMessage.split("\n")[0] ?? rawMessage;
  const message = firstLine.replace(/^Uncaught \(in promise\)\s*/u, "").trim();
  return {
    message: message || "Unhandled promise rejection",
    ...(description.includes("\n") ? { stack: description } : {})
  };
}

export class RuntimeCollector {
  readonly #page: Page;
  readonly #maxEvents: number;
  readonly #events: RuntimeEvent[] = [];
  #sequence = 0;
  #dropped = 0;
  #disposed = false;
  #cdp: CDPSession | undefined;

  readonly #onPageError = (error: Error): void => {
    this.#push({
      kind: "page-error",
      message: error.message || error.name,
      ...(error.stack ? { stack: error.stack } : {})
    });
  };

  readonly #onConsole = (message: ConsoleMessage): void => {
    if (message.type() !== "error") {
      return;
    }
    const location = message.location();
    this.#push({
      kind: "console-error",
      message: message.text(),
      ...(location.url
        ? {
            location: {
              url: location.url,
              lineNumber: location.lineNumber,
              columnNumber: location.columnNumber
            }
          }
        : {})
    });
  };

  readonly #onCdpException = (payload: unknown): void => {
    const rejection = rejectionFromCdp(payload);
    if (!rejection) {
      return;
    }
    this.#push({
      kind: "unhandled-rejection",
      message: rejection.message,
      ...(rejection.stack ? { stack: rejection.stack } : {})
    });
  };

  private constructor(page: Page, maxEvents: number) {
    this.#page = page;
    this.#maxEvents = maxEvents;
    page.on("pageerror", this.#onPageError);
    page.on("console", this.#onConsole);
  }

  static async create(
    page: Page,
    maxEvents: number
  ): Promise<RuntimeCollector> {
    const collector = new RuntimeCollector(page, maxEvents);
    await collector.#connectCdp();
    return collector;
  }

  get disposed(): boolean {
    return this.#disposed;
  }

  snapshot(): RuntimeSnapshot {
    return {
      events: this.#events.map((event) => ({ ...event })),
      dropped: this.#dropped,
      unhandledRejectionCollection: this.#cdp ? "supported" : "unavailable"
    };
  }

  async flush(): Promise<void> {
    const cdp = this.#cdp;
    if (!cdp || this.#disposed) {
      return;
    }
    try {
      await cdp.send("Runtime.enable");
    } catch {
      if (this.#cdp === cdp) {
        this.#cdp = undefined;
        cdp.off("Runtime.exceptionThrown", this.#onCdpException);
        try {
          await cdp.detach();
        } catch {
          // The failed health check may mean the session is already detached.
        }
      }
    }
  }

  async dispose(): Promise<void> {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#page.off("pageerror", this.#onPageError);
    this.#page.off("console", this.#onConsole);

    const cdp = this.#cdp;
    this.#cdp = undefined;
    if (cdp) {
      cdp.off("Runtime.exceptionThrown", this.#onCdpException);
      try {
        await cdp.send("Runtime.disable");
      } catch {
        // The page or browser may already be closed.
      }
      try {
        await cdp.detach();
      } catch {
        // Detach is idempotent from the observer's perspective.
      }
    }
  }

  #push(event: Omit<RuntimeEvent, "sequence">): void {
    if (this.#disposed) {
      return;
    }
    if (this.#events.length >= this.#maxEvents) {
      this.#dropped += 1;
      return;
    }
    this.#events.push({
      ...event,
      message: truncate(event.message, 4_000),
      ...(event.stack ? { stack: truncate(event.stack, 12_000) } : {}),
      ...(event.location
        ? {
            location: {
              ...event.location,
              url: truncate(event.location.url, 2_048)
            }
          }
        : {}),
      sequence: this.#sequence
    });
    this.#sequence += 1;
  }

  async #connectCdp(): Promise<void> {
    let cdp: CDPSession | undefined;
    try {
      cdp = await this.#page.context().newCDPSession(this.#page);
      cdp.on("Runtime.exceptionThrown", this.#onCdpException);
      await cdp.send("Runtime.enable");
      this.#cdp = cdp;
    } catch {
      // Page events still provide the portable subset. Chromium adds precise
      // promise-rejection classification through CDP.
      if (cdp) {
        cdp.off("Runtime.exceptionThrown", this.#onCdpException);
        try {
          await cdp.send("Runtime.disable");
        } catch {
          // Runtime may not have been enabled.
        }
        try {
          await cdp.detach();
        } catch {
          // The session may already have detached during initialization.
        }
      }
      this.#cdp = undefined;
    }
  }
}
