import { z } from 'zod'
import type { ToolDef, ToolContext, ToolResult } from '../base.js'

export const EnterPlanModeTool: ToolDef<Record<never, never>, string> = {
  name: 'EnterPlanMode',
  description:
    'Enter plan mode. In plan mode, all side-effect tools (Bash, FileWrite, FileEdit) are disabled. ' +
    'Use this when you want to analyze the codebase and present a detailed plan to the user BEFORE making any changes. ' +
    'The user can then approve or modify the plan. Call ExitPlanMode when ready to execute.',
  inputSchema: z.object({}),

  async execute(_input, context: ToolContext): Promise<ToolResult<string>> {
    if (!context.sessionState) {
      return { content: 'PlanMode is not available in this context.', isError: true }
    }
    if (context.sessionState.planMode) {
      return { content: 'Already in plan mode.' }
    }
    context.sessionState.planMode = true
    return {
      content:
        '✅ Entered plan mode. Side-effect tools (Bash, FileWrite, FileEdit) are now disabled.\n' +
        'Analyze the codebase using read-only tools (FileRead, Glob, Grep, LS) and present your complete plan.\n' +
        'Call ExitPlanMode when ready to execute.',
    }
  },
}

export const ExitPlanModeTool: ToolDef<Record<never, never>, string> = {
  name: 'ExitPlanMode',
  description:
    'Exit plan mode and re-enable all tools including side-effect tools (Bash, FileWrite, FileEdit). ' +
    'Call this after presenting your plan and the user has approved it.',
  inputSchema: z.object({}),

  async execute(_input, context: ToolContext): Promise<ToolResult<string>> {
    if (!context.sessionState) {
      return { content: 'PlanMode is not available in this context.', isError: true }
    }
    if (!context.sessionState.planMode) {
      return { content: 'Not currently in plan mode.' }
    }
    context.sessionState.planMode = false
    return {
      content:
        '✅ Exited plan mode. All tools are now enabled. You may proceed with executing the plan.',
    }
  },
}
