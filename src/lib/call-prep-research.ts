/**
 * call-prep-research.ts
 *
 * Agentic research loop for call prep document generation.
 * Instead of running fixed queries, this module gives Claude Opus 4.8 direct
 * access to web_search and web_fetch tools and lets the model drive its own
 * research. The model decides what to search, what pages to fetch, and when
 * it has enough material to produce the structured output.
 *
 * Architecture change (2026-06-03): moved from static "research then synthesize"
 * to agentic "research + synthesize in one call" after the static pipeline
 * produced thin research that left gaps in the output document.
 */

import Anthropic from '@anthropic-ai/sdk'
import { searchTavily } from './tavily'
import type { CallPrepOutput } from './call-prep-prompt'

// ─── Tool definitions for the Anthropic API ────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'web_search',
    description: 'Search the web for information. Returns search results with titles, URLs, and content snippets. Use this to find specific facts about schools, coaches, programs, rosters, season records, academic programs, etc. Be specific in queries — "Illinois Tech men\'s soccer 2025 season record" is better than "IIT soccer".',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'The search query. Be specific and targeted.',
        },
        max_results: {
          type: 'number',
          description: 'Maximum number of results to return (default 5, max 10).',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'web_fetch',
    description: 'Fetch and read the content of a specific web page. Returns the page content as text. Use this to read roster pages, coach bios, program pages, and other specific URLs you\'ve found via search or know exist. Athletics sites typically follow patterns like [school].edu/sports/msoc/roster or [school]athletics.com/sports/mens-soccer/roster.',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: {
          type: 'string',
          description: 'The URL to fetch. Must be a complete URL starting with http:// or https://.',
        },
      },
      required: ['url'],
    },
  },
]

// ─── Tool execution ────────────────────────────────────────────────────────

async function executeWebSearch(query: string, maxResults = 5): Promise<string> {
  try {
    const results = await searchTavily({
      query,
      maxResults: Math.min(maxResults, 10),
    })
    if (results.length === 0) return 'No results found for this query.'

    return results.map(r => {
      const content = r.raw_content
        ? r.raw_content.slice(0, 3000)
        : r.content.slice(0, 1500)
      return `TITLE: ${r.title}\nURL: ${r.url}\nCONTENT:\n${content}`
    }).join('\n\n---\n\n')
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return `Search failed: ${msg}`
  }
}

async function executeWebFetch(url: string): Promise<string> {
  try {
    // Use Tavily's extract endpoint for better HTML-to-text conversion
    const apiKey = process.env.TAVILY_API_KEY
    if (!apiKey) throw new Error('TAVILY_API_KEY not set')

    const res = await fetch('https://api.tavily.com/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        urls: [url],
      }),
    })

    if (!res.ok) {
      // Fallback to direct fetch if Tavily extract fails
      return await directFetch(url)
    }

    const data = await res.json()
    const results = data.results as Array<{ url: string; raw_content: string }> | undefined
    if (results && results.length > 0 && results[0].raw_content) {
      return results[0].raw_content.slice(0, 15000)
    }

    return await directFetch(url)
  } catch {
    return await directFetch(url)
  }
}

async function directFetch(url: string): Promise<string> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FinnRecruitingCRM/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    })
    clearTimeout(timeout)

    if (!res.ok) return `Fetch failed: HTTP ${res.status}`

    const html = await res.text()
    // Basic HTML-to-text: strip tags, collapse whitespace
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#\d+;/g, '')
      .replace(/\s+/g, ' ')
      .trim()

    return text.slice(0, 15000) || 'Page loaded but no readable text content found.'
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return `Fetch failed: ${msg}`
  }
}

async function executeTool(
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  switch (name) {
    case 'web_search':
      return executeWebSearch(
        input.query as string,
        (input.max_results as number) ?? 5,
      )
    case 'web_fetch':
      return executeWebFetch(input.url as string)
    default:
      return `Unknown tool: ${name}`
  }
}

// ─── Agentic research loop ────────────────────────────────────────────────

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

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userPrompt },
  ]

  let toolCallCount = 0
  let totalInputTokens = 0
  let totalOutputTokens = 0
  const maxIterations = 30 // safety cap

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    onProgress?.(`Research iteration ${iteration + 1}...`)

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 16000,
      system: systemPrompt,
      tools: TOOLS,
      messages,
    })

    totalInputTokens += response.usage.input_tokens
    totalOutputTokens += response.usage.output_tokens

    // Check if the model wants to use tools
    if (response.stop_reason === 'tool_use') {
      // Add the assistant's response (which includes tool_use blocks)
      messages.push({ role: 'assistant', content: response.content })

      // Execute all tool calls and build tool results
      const toolResults: Anthropic.ToolResultBlockParam[] = []

      for (const block of response.content) {
        if (block.type === 'tool_use') {
          toolCallCount++
          const toolName = block.name
          const input = block.input as Record<string, unknown>

          onProgress?.(
            toolName === 'web_search'
              ? `Searching: ${(input.query as string).slice(0, 60)}...`
              : `Fetching: ${(input.url as string).slice(0, 60)}...`
          )

          const result = await executeTool(toolName, input)

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result,
          })
        }
      }

      // Add tool results as the next user message
      messages.push({ role: 'user', content: toolResults })
      continue
    }

    // Model finished — extract the JSON output from the final response
    if (response.stop_reason === 'end_turn') {
      // Find the text block with the JSON
      let jsonText = ''
      for (const block of response.content) {
        if (block.type === 'text') {
          jsonText += block.text
        }
      }

      jsonText = jsonText
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim()

      let prepData: CallPrepOutput
      try {
        prepData = JSON.parse(jsonText)
      } catch {
        // Try to extract JSON from surrounding text
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          prepData = JSON.parse(jsonMatch[0])
        } else {
          throw new Error(`Model returned invalid JSON after ${toolCallCount} tool calls. First 500 chars: ${jsonText.slice(0, 500)}`)
        }
      }

      return {
        prepData,
        toolCallCount,
        totalInputTokens,
        totalOutputTokens,
      }
    }

    // Unexpected stop reason
    throw new Error(`Unexpected stop_reason: ${response.stop_reason}`)
  }

  throw new Error(`Agentic loop exceeded ${maxIterations} iterations without producing output`)
}
