import type { Metadata } from 'next'
import MarketingHome from '@/components/marketing/MarketingHome'

// Public marketing home. No auth, no data — renders for signed-out visitors.
export const metadata: Metadata = {
  title: 'finnsoccer — get recruited, without the guesswork',
  description:
    'The college soccer recruiting process, organized — every coach conversation, camp, and offer in one place, with a clear next move at every step.',
}

export default function Home() {
  return <MarketingHome />
}
