import { BashTool } from './BashTool/index.js'
import { FileReadTool } from './FileReadTool/index.js'
import { FileEditTool } from './FileEditTool/index.js'
import { FileWriteTool } from './FileWriteTool/index.js'
import { GrepTool } from './GrepTool/index.js'
import { GlobTool } from './GlobTool/index.js'
import { LSTool } from './LSTool/index.js'
import { WebFetchTool } from './WebFetchTool/index.js'
import { WebSearchTool } from './WebSearchTool/index.js'
import { AskUserTool } from './AskUserTool/index.js'
import { EnterPlanModeTool, ExitPlanModeTool } from './PlanModeTool/index.js'
import { TodoWriteTool, TodoReadTool, TodoUpdateTool, TodoDeleteTool } from './TodoWriteTool/index.js'
import { SubAgentTool } from './SubAgentTool/index.js'
import { buildToolSchema } from './base.js'
import type { ToolDef } from './base.js'

/** All tools available to the main agent */
export const ALL_TOOLS: ToolDef[] = [
  BashTool,
  FileReadTool,
  FileEditTool,
  FileWriteTool,
  GrepTool,
  GlobTool,
  LSTool,
  WebFetchTool,
  WebSearchTool,
  AskUserTool,
  TodoWriteTool,
  TodoReadTool,
  TodoUpdateTool,
  TodoDeleteTool,
  EnterPlanModeTool,
  ExitPlanModeTool,
  SubAgentTool,
]

/** Tools available to sub-agents (no SubAgent to prevent recursion) */
export const SUB_AGENT_TOOLS: ToolDef[] = ALL_TOOLS.filter(t => t.name !== 'SubAgent')

/** Map of tool name → tool definition */
export const TOOL_MAP: Map<string, ToolDef> = new Map(
  ALL_TOOLS.map(t => [t.name, t]),
)

/** Anthropic-format tool schemas to pass to the model */
export const TOOL_SCHEMAS = ALL_TOOLS.map(buildToolSchema)

/** Tool schemas for sub-agents (no SubAgent) */
export const SUB_AGENT_TOOL_SCHEMAS = SUB_AGENT_TOOLS.map(buildToolSchema)

export {
  BashTool,
  FileReadTool,
  FileEditTool,
  FileWriteTool,
  GrepTool,
  GlobTool,
  LSTool,
  WebFetchTool,
  WebSearchTool,
  AskUserTool,
  TodoWriteTool,
  TodoReadTool,
  TodoUpdateTool,
  TodoDeleteTool,
  EnterPlanModeTool,
  ExitPlanModeTool,
  SubAgentTool,
}
export type { ToolDef, ToolContext, ToolResult } from './base.js'
