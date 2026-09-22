import { codeMode } from "tardie/agent"
import { workspacePackage, type WorkspacePolicy } from "tardie/code"
import { exaPackage, type ExaPolicy } from "./exa"

export function code(
  researchPolicy: Partial<ExaPolicy> = {},
  workspacePolicy: Partial<WorkspacePolicy> = {}
) {
  return codeMode([
    exaPackage(researchPolicy),
    workspacePackage({ policy: workspacePolicy })
  ])
}
