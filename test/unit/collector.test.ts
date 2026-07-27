import type { CDPSession, Page } from "@playwright/test";
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

import { RuntimeCollector } from "../../src/runtime/collector.ts";

describe("runtime collector", () => {
  it("discards exceptions replayed while the CDP session is enabled", async () => {
    const cdp = new EventEmitter() as EventEmitter & {
      send: ReturnType<typeof vi.fn>;
      detach: ReturnType<typeof vi.fn>;
    };
    const rejection = (message: string) => ({
      exceptionDetails: {
        text: "Uncaught (in promise)",
        exception: {
          description: `Uncaught (in promise) Error: ${message}`
        }
      }
    });
    cdp.send = vi.fn(async (method: string) => {
      if (method === "Runtime.enable") {
        cdp.emit("Runtime.exceptionThrown", rejection("old rejection"));
      }
    });
    cdp.detach = vi.fn(async () => undefined);

    const page = new EventEmitter() as EventEmitter & {
      context(): {
        newCDPSession(): Promise<CDPSession>;
      };
    };
    page.context = () => ({
      newCDPSession: async () => cdp as unknown as CDPSession
    });

    const collector = await RuntimeCollector.create(
      page as unknown as Page,
      10
    );

    expect(collector.snapshot().events).toEqual([]);
    cdp.emit("Runtime.exceptionThrown", rejection("new rejection"));
    expect(collector.snapshot().events).toEqual([
      expect.objectContaining({
        kind: "unhandled-rejection",
        message: "Error: new rejection",
        sequence: 0
      })
    ]);

    await collector.dispose();
  });

  it("detaches a CDP session when initialization fails", async () => {
    const cdp = new EventEmitter() as EventEmitter & {
      send: ReturnType<typeof vi.fn>;
      detach: ReturnType<typeof vi.fn>;
    };
    cdp.send = vi.fn(async (method: string) => {
      if (method === "Runtime.enable") {
        throw new Error("unsupported");
      }
    });
    cdp.detach = vi.fn(async () => undefined);

    const page = new EventEmitter() as EventEmitter & {
      context(): {
        newCDPSession(): Promise<CDPSession>;
      };
    };
    page.context = () => ({
      newCDPSession: async () => cdp as unknown as CDPSession
    });

    const collector = await RuntimeCollector.create(
      page as unknown as Page,
      10
    );

    expect(cdp.listenerCount("Runtime.exceptionThrown")).toBe(0);
    expect(cdp.send).toHaveBeenCalledWith("Runtime.disable");
    expect(cdp.detach).toHaveBeenCalledOnce();
    expect(collector.snapshot().unhandledRejectionCollection).toBe(
      "unavailable"
    );

    await collector.dispose();
    expect(page.listenerCount("console")).toBe(0);
    expect(page.listenerCount("pageerror")).toBe(0);
  });

  it("marks rejection collection unavailable when its health check fails", async () => {
    const cdp = new EventEmitter() as EventEmitter & {
      send: ReturnType<typeof vi.fn>;
      detach: ReturnType<typeof vi.fn>;
    };
    cdp.send = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("session closed"));
    cdp.detach = vi.fn(async () => undefined);

    const page = new EventEmitter() as EventEmitter & {
      context(): {
        newCDPSession(): Promise<CDPSession>;
      };
    };
    page.context = () => ({
      newCDPSession: async () => cdp as unknown as CDPSession
    });

    const collector = await RuntimeCollector.create(
      page as unknown as Page,
      10
    );
    expect(collector.snapshot().unhandledRejectionCollection).toBe("supported");

    await collector.flush();

    expect(collector.snapshot().unhandledRejectionCollection).toBe(
      "unavailable"
    );
    expect(cdp.listenerCount("Runtime.exceptionThrown")).toBe(0);
    expect(cdp.detach).toHaveBeenCalledOnce();
    await collector.dispose();
  });
});
