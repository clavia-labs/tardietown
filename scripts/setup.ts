const result = Bun.spawnSync(["bun", "install", "--frozen-lockfile"], { stdout: "inherit", stderr: "inherit" })
process.exit(result.exitCode)
