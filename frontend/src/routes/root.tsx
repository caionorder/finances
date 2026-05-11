import { Outlet } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'

export default function Root() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Outlet />
      <Toaster />
    </div>
  )
}
