import { expect, test } from "@playwright/test";
import {
  attachRenderReport,
  defineRenderContract,
  observePage,
  renderContractMatchers
} from "playwright-render-contract";

expect.extend(renderContractMatchers);

const mapContract = defineRenderContract({
  ready: {
    all: [
      {
        selector: 'main[data-render-state="settled"][data-map-ready="true"]',
        state: "visible"
      }
    ],
    none: [
      { selector: 'main[aria-busy="true"]', state: "visible" },
      { selector: '[data-tile-quality="low"]', state: "visible" }
    ],
    timeoutMs: 15_000
  }
});

test("captures the map after detailed tiles settle", async ({
  page
}, testInfo) => {
  const observer = await observePage(page);
  try {
    await page.goto("http://localhost:3000/map");

    await expect(observer).toPassRenderContract(mapContract);
    await expect(page).toHaveScreenshot("map-settled.png");

    const report = await observer.inspect(mapContract);
    await attachRenderReport(report, testInfo);
  } finally {
    await observer.dispose();
  }
});
