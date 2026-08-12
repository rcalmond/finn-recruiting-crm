import type { Metadata } from 'next'
import MarketingHome from '@/components/marketing/MarketingHome'

// Public marketing home. No auth, no data — renders for signed-out visitors.
export const metadata: Metadata = {
  title: 'Throughball — Get recruited. Without the guesswork.',
  description:
    'The assist for your kid’s recruiting. Every coach conversation, camp, and offer in one place — with Regista reading each reply and weighting your next move.',
}

export default function Home() {
  return <MarketingHome />
}
