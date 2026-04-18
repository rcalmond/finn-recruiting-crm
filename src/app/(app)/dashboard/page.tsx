import { redirect } from 'next/navigation'

// Dashboard moved to /pipeline
export default function DashboardPage() {
  redirect('/pipeline')
}
