import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const repository = dirname(root);
const windows = process.platform === "win32";
const environment = {
  ...process.env,
  NPM_CONFIG_DRY_RUN: "false",
  npm_config_dry_run: "false"
};

function binary(name) {
  return join(
    repository,
    "node_modules",
    ".bin",
    windows ? `${name}.cmd` : name
  );
}

function run(name, arguments_ = []) {
  execFileSync(binary(name), arguments_, {
    cwd: repository,
    env: environment,
    shell: windows,
    stdio: "inherit"
  });
}

run("publint");
run("attw", ["--pack", "--profile", "esm-only", "."]);
