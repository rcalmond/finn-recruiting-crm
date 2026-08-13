/**
 * agentic-research.ts
 *
 * Shared agentic web-research machinery: the Tavily-backed web_search / web_fetch
 * tools and a generic tool-use loop. Extracted from call-prep-research.ts so the
 * school-research pipeline can reuse the exact same tools + loop shape without
 * copy-pasting. Call prep keeps its behaviour (opus-4-8, 30 iterations, its own
 * JSON parse) by passing those as params.
 *
 * THE LEDGER: runAgenticLoop returns `fetchedUrls` — every URL whose content
 * actually entered the model's context this run (web_search result URLs + every
 * successful web_fetch). It is built SERVER-SIDE from the tool-call log, never
 * from model output, and is the ground truth the grounding validator checks
 * sources[] against.
 */

import Anthropic from '@anthropic-ai/sdk'
import { searchTavily } from './tavily'

// ─── Tool definitions ────────────────────────────────────────────────────────

export const RESEARCH_TOOLS: Anthropic.Tool[] = [
  {
    name: 'web_search',
    description: 'Search the web for information. Returns search results with titles, URLs, and content snippets. Use this to find specific facts about schools, coaches, programs, rosters, season records, academic programs, etc. Be specific in queries — "Illinois Tech men\'s soccer 2025 season record" is better than "IIT soccer".',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'The search query. Be specific and targeted.' },
        max_results: { type: 'number', description: 'Maximum number of results to return (default 5, max 10).' },
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
        url: { type: 'string', description: 'The URL to fetch. Must be a complete URL starting with http:// or https://.' },
      },
      required: ['url'],
    },
  },
]

// ─── URL normalization (for the ledger + validator) ──────────────────────────

/** Normalize a URL for ledger membership checks: lowercase host, drop trailing
 *  slash, drop fragment. Keeps query strings (they can change the page). */
export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw.trim())
    u.hash = ''
    let s = u.toString()
    if (s.endsWith('/')) s = s.slice(0, -1)
    return s.toLowerCase()
  } catch {
    return raw.trim().replace(/\/+$/, '').toLowerCase()
  }
}

// ─── Tool execution (returns output text + the URLs that fed context) ────────

interface ToolExecResult { output: string; urls: string[] }

async function executeWebSearch(query: string, maxResults = 5): Promise<ToolExecResult> {
  try {
    const results = await searchTavily({ query, maxResults: Math.min(maxResults, 10) })
    if (results.length === 0) return { output: 'No results found for this query.', urls: [] }
    const output = results.map(r => {
      const content = r.raw_content ? r.raw_content.slice(0, 3000) : r.content.slice(0, 1500)
      return `TITLE: ${r.title}\nURL: ${r.url}\nCONTENT:\n${content}`
    }).join('\n\n---\n\n')
    // Ledger: the model saw the content/snippets of every returned URL.
    return { output, urls: results.map(r => r.url) }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { output: `Search failed: ${msg}`, urls: [] }
  }
}

async function executeWebFetch(url: string): Promise<ToolExecResult> {
  try {
    const apiKey = process.env.TAVILY_API_KEY
    if (!apiKey) throw new Error('TAVILY_API_KEY not set')

    const res = await fetch('https://api.tavily.com/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey, urls: [url] }),
    })

    if (res.ok) {
      const data = await res.json()
      const results = data.results as Array<{ url: string; raw_content: string }> | undefined
      if (results && results.length > 0 && results[0].raw_content) {
        return { output: results[0].raw_content.slice(0, 15000), urls: [url] }
      }
    }
    // Fallback to direct fetch
    const direct = await directFetch(url)
    return { output: direct.output, urls: direct.ok ? [url] : [] }
  } catch {
    const direct = await directFetch(url)
    return { output: direct.output, urls: direct.ok ? [url] : [] }
  }
}

async function directFetch(url: string): Promise<{ output: string; ok: boolean }> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ThroughballResearch/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    })
    clearTimeout(timeout)
    if (!res.ok) return { output: `Fetch failed: HTTP ${res.status}`, ok: false }
    const html = await res.text()
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>').replace(/&#\d+;/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (!text) return { output: 'Page loaded but no readable text content found.', ok: false }
    return { output: text.slice(0, 15000), ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { output: `Fetch failed: ${msg}`, ok: false }
  }
}

async function executeTool(name: string, input: Record<string, unknown>): Promise<ToolExecResult> {
  switch (name) {
    case 'web_search':
      return executeWebSearch(input.query as string, (input.max_results as number) ?? 5)
    case 'web_fetch':
      return executeWebFetch(input.url as string)
    default:
      return { output: `Unknown tool: ${name}`, urls: [] }
  }
}

// ─── The generic agentic loop ────────────────────────────────────────────────

export interface AgenticLoopParams {
  systemPrompt: string
  userPrompt: string
  model: string
  maxIterations: number
  maxTokens?: number
  onProgress?: (message: string) => void
}

export interface AgenticLoopResult {
  /** Concatenated text of the model's final (non-tool) turn — the caller parses it. */
  finalText: string
  toolCallCount: number
  totalInputTokens: number
  totalOutputTokens: number
  /** Server-side ledger: every URL whose content entered context this run (deduped). */
  fetchedUrls: string[]
}

export async function runAgenticLoop(params: AgenticLoopParams): Promise<AgenticLoopResult> {
  const { systemPrompt, userPrompt, model, maxIterations, maxTokens = 16000, onProgress } = params

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userPrompt }]

  let toolCallCount = 0
  let totalInputTokens = 0
  let totalOutputTokens = 0
  const fetchedUrls = new Set<string>()

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    onProgress?.(`Research iteration ${iteration + 1}...`)

    const response = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      tools: RESEARCH_TOOLS,
      messages,
    })

    totalInputTokens += response.usage.input_tokens
    totalOutputTokens += response.usage.output_tokens

    // If the model requested any tools this turn, execute them and continue —
    // regardless of stop_reason. Otherwise the turn IS the final answer (end_turn,
    // or a max_tokens-truncated final message we still hand back to the caller,
    // whose JSON parser reports a clean error if it was cut off).
    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')

    if (toolUses.length > 0) {
      messages.push({ role: 'assistant', content: response.content })
      const toolResults: Anthropic.ToolResultBlockParam[] = []
      for (const block of toolUses) {
        toolCallCount++
        const input = block.input as Record<string, unknown>
        onProgress?.(
          block.name === 'web_search'
            ? `Searching: ${String(input.query ?? '').slice(0, 60)}...`
            : `Fetching: ${String(input.url ?? '').slice(0, 60)}...`
        )
        const { output, urls } = await executeTool(block.name, input)
        for (const u of urls) fetchedUrls.add(u)
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: output })
      }
      messages.push({ role: 'user', content: toolResults })
      continue
    }

    let finalText = ''
    for (const block of response.content) {
      if (block.type === 'text') finalText += block.text
    }
    if (response.stop_reason === 'max_tokens') {
      onProgress?.('Model hit the output cap on its final answer — parsing what it produced.')
    }
    return {
      finalText,
      toolCallCount,
      totalInputTokens,
      totalOutputTokens,
      fetchedUrls: Array.from(fetchedUrls),
    }
  }

  throw new Error(`Agentic loop exceeded ${maxIterations} iterations without producing output`)
}

// ─── Shared JSON extraction (fences + balanced-brace fallback) ───────────────

/** Extract a JSON object from model text: strips fences, then falls back to a
 *  balanced-brace scan for JSON wrapped in commentary. Throws on total failure. */
export function extractJsonObject(raw: string): unknown {
  const stripped = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
  try {
    return JSON.parse(stripped)
  } catch {
    const start = stripped.indexOf('{')
    if (start < 0) throw new Error('No JSON object found in model output')
    let depth = 0, inString = false, escaped = false
    for (let i = start; i < stripped.length; i++) {
      const c = stripped[i]
      if (escaped) { escaped = false; continue }
      if (c === '\\' && inString) { escaped = true; continue }
      if (c === '"') { inString = !inString; continue }
      if (inString) continue
      if (c === '{') depth++
      else if (c === '}') { depth--; if (depth === 0) return JSON.parse(stripped.slice(start, i + 1)) }
    }
    throw new Error('No balanced JSON object found in model output')
  }
}
