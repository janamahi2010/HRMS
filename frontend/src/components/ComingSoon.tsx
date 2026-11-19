import { Construction } from 'lucide-react'
import { EmptyState } from './EmptyState'
import { PageHeader } from './PageHeader'
import { Card } from './ui/card'

/** Temporary placeholder for modules built in later phases. */
export function ComingSoon({ title, description, phase }: { title: string; description: string; phase: number }) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <Card>
        <EmptyState icon={Construction} title="Under construction" description={`This module is being built in phase ${phase}.`} />
      </Card>
    </>
  )
}
