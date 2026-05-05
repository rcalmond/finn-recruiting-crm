/**
 * tavily.ts
 *
 * Tavily search API client for camp web discovery.
 */

export interface TavilyResult {
  title: string
  url: string
  content: string
  raw_content: string | null
  score: number
}

export async function searchTavily(input: {
  query: string
  maxResults?: number
}): Promise<TavilyResult[]> {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) throw new Error('TAVILY_API_KEY not set')

  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query: input.query,
      search_depth: 'advanced',
      max_results: input.maxResults ?? 5,
      include_raw_content: true,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Tavily API error: ${res.status} ${body.slice(0, 200)}`)
  }

  const data = await res.json()
  return (data.results ?? []) as TavilyResult[]
}
