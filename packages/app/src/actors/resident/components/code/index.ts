import { mcpPackages } from "./mcp"
import { codeMode } from "tardie/agent"
import { fetchPackage, workspacePackage, type WorkspacePolicy } from "tardie/code"
import { type ExaPolicy } from "./exa"

export function code(
  _researchPolicy: Partial<ExaPolicy> = {},
  workspacePolicy: Partial<WorkspacePolicy> = {}
) {
  return codeMode([
    mcpPackages(),
    fetchPackage({ policy: { bodyChars: 24000 } }),
    workspacePackage({ policy: workspacePolicy })
  ])
}
