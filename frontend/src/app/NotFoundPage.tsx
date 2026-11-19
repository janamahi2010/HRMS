import { Compass } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'

export default function NotFoundPage() {
  return (
    <EmptyState
      icon={Compass}
      title="Page not found"
      description="The page you’re looking for doesn’t exist or has moved."
      action={
        <Button asChild>
          <Link to="/">Back to home</Link>
        </Button>
      }
    />
  )
}
