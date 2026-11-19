import { CalendarRange, ClipboardList, Inbox, Mail, Plus, Users, Wallet } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/features/auth/AuthProvider'
import { useLeaveRequests } from './api'
import { ApplyLeaveDialog } from './ApplyLeaveDialog'
import { BalancesAdmin } from './BalancesAdmin'
import { LeaveRequestList } from './LeaveRequestList'
import { BalanceCards, OnLeaveToday } from './LeaveWidgets'
import { TeamLeaveCalendar } from './TeamLeaveCalendar'

export default function LeavePage() {
  const { hasRole } = useAuth()
  const isApprover = hasRole('admin', 'manager')
  const isAdmin = hasRole('admin')
  const [params, setParams] = useSearchParams()
  const [applyOpen, setApplyOpen] = useState(false)

  const tabs = [
    { value: 'mine', label: 'My leave', icon: ClipboardList, show: true },
    { value: 'approvals', label: 'Approvals', icon: Inbox, show: isApprover },
    { value: 'calendar', label: 'Team calendar', icon: CalendarRange, show: true },
    { value: 'team', label: isAdmin ? 'All requests' : 'Team requests', icon: Users, show: isApprover },
    { value: 'cc', label: "CC'd to me", icon: Mail, show: true },
    { value: 'balances', label: 'Balances', icon: Wallet, show: isAdmin },
  ].filter((t) => t.show)
  const tab = tabs.some((t) => t.value === params.get('tab')) ? params.get('tab')! : 'mine'

  const pending = useLeaveRequests({ scope: 'approvals', status: 'pending', search: '', page: 1 })
  const pendingCount = isApprover ? pending.data?.count ?? 0 : 0

  return (
    <>
      <PageHeader
        title="Leave"
        description="Balances, requests and who's away."
        actions={
          <Button onClick={() => setApplyOpen(true)}>
            <Plus /> Apply leave
          </Button>
        }
      />
      <BalanceCards className="mb-6" />

      <Tabs value={tab} onValueChange={(v) => setParams(v === 'mine' ? {} : { tab: v }, { replace: true })}>
        <TabsList aria-label="Leave views" className="max-w-full overflow-x-auto">
          {tabs.map(({ value, label, icon: Icon }) => (
            <TabsTrigger key={value} value={value}>
              <Icon aria-hidden /> {label}
              {value === 'approvals' && pendingCount > 0 && (
                <Badge tone="primary" className="ml-0.5 px-1.5 py-0 tabular">
                  {pendingCount}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="mine">
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-6">
            <LeaveRequestList scope="mine" onApply={() => setApplyOpen(true)} />
            <OnLeaveToday />
          </div>
        </TabsContent>
        {isApprover && (
          <TabsContent value="approvals">
            <LeaveRequestList scope="approvals" />
          </TabsContent>
        )}
        <TabsContent value="calendar">
          <TeamLeaveCalendar />
        </TabsContent>
        {isApprover && (
          <TabsContent value="team">
            <LeaveRequestList scope="team" />
          </TabsContent>
        )}
        <TabsContent value="cc">
          <LeaveRequestList scope="cc" />
        </TabsContent>
        {isAdmin && (
          <TabsContent value="balances">
            <BalancesAdmin />
          </TabsContent>
        )}
      </Tabs>
      <ApplyLeaveDialog open={applyOpen} onOpenChange={setApplyOpen} />
    </>
  )
}
