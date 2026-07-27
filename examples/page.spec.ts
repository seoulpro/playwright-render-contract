import { expect, test } from "@playwright/test";
import {
  observePage,
  renderContractMatchers
} from "render-contract";

expect.extend(renderContractMatchers);

test("page is ready and stable", async ({ page }) => {
  const observer = await observePage(page);
  try {
    await page.goto("http://localhost:3000/");
    await expect(observer).toPassRenderContract({
      ready: {
        all: [{ selector: "main[data-ready=true]" }],
        none: [{ selector: "[aria-busy=true]" }]
      }
    });
  } finally {
    await observer.dispose();
  }
});

