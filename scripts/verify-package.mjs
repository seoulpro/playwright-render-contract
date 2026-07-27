import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const repository = dirname(root);
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const temporaryDirectory = await mkdtemp(
  join(tmpdir(), "playwright-render-contract-package-")
);

function run(command, arguments_, cwd) {
  return execFileSync(command, arguments_, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"]
  });
}

async function packageVersion(path) {
  return JSON.parse(await readFile(path, "utf8")).version;
}

function parsePackResult(output) {
  const result = /(\[\s*\{[\s\S]*\}\s*\])\s*$/u.exec(output);
  assert(result?.[1], "npm pack did not return JSON metadata");
  return JSON.parse(result[1]);
}

try {
  const packed = parsePackResult(
    run(
      npmCommand,
      ["pack", "--silent", "--json", "--pack-destination", temporaryDirectory],
      repository
    )
  )[0];
  assert(packed, "npm pack did not describe an artifact");

  const expectedFiles = new Set([
    "CONTRIBUTING.md",
    "LICENSE",
    "README.md",
    "SECURITY.md",
    "docs/design-notes.md",
    "package.json"
  ]);
  for (const file of packed.files) {
    const allowed =
      expectedFiles.has(file.path) || file.path.startsWith("dist/");
    assert(allowed, `unexpected package file: ${file.path}`);
  }
  for (const expected of expectedFiles) {
    assert(
      packed.files.some((file) => file.path === expected),
      `missing package file: ${expected}`
    );
  }

  const archive = join(temporaryDirectory, packed.filename);
  const consumer = join(temporaryDirectory, "consumer");
  await mkdir(consumer);
  await writeFile(
    join(consumer, "package.json"),
    `${JSON.stringify({ private: true, type: "module" }, null, 2)}\n`
  );

  const playwrightVersion = await packageVersion(
    join(repository, "node_modules", "@playwright", "test", "package.json")
  );
  const nodeTypesVersion = await packageVersion(
    join(repository, "node_modules", "@types", "node", "package.json")
  );
  const typescriptVersion = await packageVersion(
    join(repository, "node_modules", "typescript", "package.json")
  );

  run(
    npmCommand,
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--no-package-lock",
      archive,
      `@playwright/test@${playwrightVersion}`,
      `@types/node@${nodeTypesVersion}`,
      `typescript@${typescriptVersion}`
    ],
    consumer
  );

  await writeFile(
    join(consumer, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          exactOptionalPropertyTypes: true,
          module: "NodeNext",
          moduleResolution: "NodeNext",
          noEmit: true,
          strict: true,
          target: "ES2022",
          types: ["node"]
        },
        include: ["*.ts"]
      },
      null,
      2
    )}\n`
  );
  await writeFile(
    join(consumer, "smoke.ts"),
    `import { expect } from "@playwright/test"
import {
  defineRenderContract,
  observePage,
  renderContractMatchers,
  type ObserverOptions,
  type RenderObserver
} from "playwright-render-contract"

expect.extend(renderContractMatchers)

const contract = defineRenderContract({
  runtime: { consoleErrors: "warning" },
  structure: { main: { min: 1, max: 1 } }
})
const options: ObserverOptions = { maxRuntimeEvents: 10 }
declare const observer: RenderObserver

async function typecheck(): Promise<void> {
  await expect(observer).toPassRenderContract(contract)
  await observePage(observer.page, options)
}

void typecheck
`
  );
  await writeFile(
    join(consumer, "example.spec.ts"),
    await readFile(join(repository, "examples", "page.spec.ts"), "utf8")
  );

  run(npmCommand, ["exec", "--", "tsc", "--noEmit"], consumer);
  run(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      'import("playwright-render-contract").then((api) => { if (typeof api.observePage !== "function") process.exitCode = 1 })'
    ],
    consumer
  );

  console.log(
    `Verified ${packed.id}: ${packed.entryCount} files, ${packed.size} bytes`
  );
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
