import { resolve } from "node:path"

const framework = resolve(process.env.TARDIGRADE_DIR ?? "../tardigrade")
for (const folder of ["packages/tardie", "packages/ui", "packages/model", "apps/server"]) {
  const cwd = resolve(framework, folder)
  const result = Bun.spawnSync(["bun", "link"], { cwd, stdout: "inherit", stderr: "inherit" })
  if (result.exitCode !== 0) process.exit(result.exitCode)
}
const result = Bun.spawnSync(["bun", "install"], { stdout: "inherit", stderr: "inherit" })
process.exit(result.exitCode)
