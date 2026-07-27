import { describe, expect, it } from "vitest";

import { applyReportUrlPolicy, defaultReportUrlPolicy } from "../../src/url.ts";

describe("report URL handling", () => {
  it("removes credentials, query strings, and fragments by default", () => {
    expect(
      defaultReportUrlPolicy(
        "https://user:password@example.test/account?token=secret#section"
      )
    ).toBe("https://example.test/account");
  });

  it("bounds opaque and opt-in full URLs", () => {
    const longUrl = `data:text/plain,${"x".repeat(3_000)}`;
    const formatted = applyReportUrlPolicy(longUrl, (url) => url);

    expect(formatted).toHaveLength(2_048);
    expect(formatted.endsWith("…")).toBe(true);
  });

  it("requires custom policies to return a string", () => {
    expect(() =>
      applyReportUrlPolicy(
        "https://example.test/",
        (() => null) as unknown as (url: string) => string
      )
    ).toThrow("must return a string");
  });

  it("removes credentials even when an HTTP URL is malformed", () => {
    expect(
      defaultReportUrlPolicy(
        "https://user:password@[invalid-host/path?token=secret"
      )
    ).toBe("https://[invalid-host/path");
  });

  it("redacts opaque malformed values without inventing an authority", () => {
    expect(defaultReportUrlPolicy("not a url?token=secret")).toBe("not a url");
    expect(defaultReportUrlPolicy("//example.test/path?token=secret")).toBe(
      "//example.test/path"
    );
  });
});
