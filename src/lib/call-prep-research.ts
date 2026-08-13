/**
 * call-prep-research.ts
 *
 * Agentic research loop for call prep document generation. Now a thin wrapper
 * over the shared machinery in agentic-research.ts (extracted 2026-08 so the
 * school-research pipeline can reuse the same Tavily-backed tools + loop).
 *
 * Behaviour is unchanged from the inline implementation: claude-opus-4-8, up to
 * 30 iterations, 16k max tokens per turn, then a fences + balanced-brace JSON
 * parse of the final turn into the CallPrepOutput schema.
 */

import { runAgenticLoop, extractJsonObject } from './agentic-research'
import type { CallPrepOutput } from './call-prep-prompt'

export interface AgenticResearchResult {
  prepData: CallPrepOutput
  toolCallCount: number
  totalInputTokens: number
  totalOutputTokens: number
}

export async function runAgenticResearch(params: {
  systemPrompt: string
  userPrompt: string
  onProgress?: (message: string) => void
}): Promise<AgenticResearchResult> {
  const { systemPrompt, userPrompt, onProgress } = params

  const { finalText, toolCallCount, totalInputTokens, totalOutputTokens } =
    await runAgenticLoop({
      systemPrompt,
      userPrompt,
      model: 'claude-opus-4-8',
      maxIterations: 30,
      maxTokens: 16000,
      onProgress,
    })

  let prepData: CallPrepOutput
  try {
    prepData = extractJsonObject(finalText) as CallPrepOutput
  } catch {
    console.error('[call-prep-research] JSON parse failed after', toolCallCount, 'tool calls. Raw:')
    console.error(finalText.slice(0, 4000))
    throw new Error(
      `Model returned invalid JSON after ${toolCallCount} tool calls. First 500 chars: ${finalText.slice(0, 500)}`
    )
  }

  return { prepData, toolCallCount, totalInputTokens, totalOutputTokens }
}
