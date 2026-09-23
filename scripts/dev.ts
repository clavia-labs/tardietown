import { fileURLToPath } from "node:url"

const app = fileURLToPath(new URL("../packages/app/", import.meta.url))
const uiPort = Number(process.env.TOWN_UI_PORT ?? 5173)
const serverPort = Number(process.env.TOWN_PORT ?? 4244)
const noOpen = process.argv.includes("--no-open")

if (!Number.isInteger(uiPort) || uiPort < 1 || uiPort > 65535 || !Number.isInteger(serverPort) || serverPort < 1 || serverPort > 65535) {
  console.error("TOWN_UI_PORT and TOWN_PORT must be valid port numbers.")
  process.exit(1)
}

const children = [
  { name: "Town server", process: Bun.spawn(["bun", "server/main.ts"], { cwd: app, stdin: "inherit", stdout: "inherit", stderr: "inherit" }) },
  { name: "Web app", process: Bun.spawn(["bun", "node_modules/vite/bin/vite.js", "--host", "127.0.0.1"], { cwd: app, stdin: "inherit", stdout: "inherit", stderr: "inherit" }) }
]

let stopping = false
async function stop(code: number) {
  if (stopping) return
  stopping = true
  for (const child of children) child.process.kill()
  await Promise.race([
    Promise.allSettled(children.map(child => child.process.exited)),
    Bun.sleep(2000)
  ])
  for (const child of children) if (child.process.exitCode === null) child.process.kill("SIGKILL")
  process.exitCode = code
}

process.on("SIGINT", () => { void stop(0) })
process.on("SIGTERM", () => { void stop(0) })

async function waitFor(name: string, url: string, child: typeof children[number]["process"]) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (stopping) throw Error("Startup cancelled.")
    if (typeof child.exitCode === "number") throw Error(`${name} exited with code ${child.exitCode}.`)
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) })
      if (response.ok) return
    } catch { /* The service is still starting. */ }
    await Bun.sleep(200)
  }
  throw Error(`${name} did not become ready at ${url}.`)
}

try {
  const url = `http://127.0.0.1:${uiPort}`
  await Promise.all([
    waitFor("Town server", `http://127.0.0.1:${serverPort}/api/town-config`, children[0]!.process),
    waitFor("Web app", url, children[1]!.process)
  ])
  console.log(`Tardie Town is ready at ${url}`)
  if (!noOpen) {
    const command = process.platform === "darwin" ? ["open", url]
      : process.platform === "win32" ? ["cmd", "/c", "start", "", url]
      : ["xdg-open", url]
    try {
      const opener = Bun.spawn(command, { stdout: "ignore", stderr: "ignore" })
      if (await opener.exited !== 0) console.warn(`Open ${url} in your browser.`)
    } catch { console.warn(`Open ${url} in your browser.`) }
  }
  const exited = await Promise.race(children.map(async child => ({ name: child.name, code: await child.process.exited })))
  if (!stopping) {
    console.error(`${exited.name} stopped with code ${exited.code}.`)
    await stop(exited.code || 1)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  await stop(1)
}
