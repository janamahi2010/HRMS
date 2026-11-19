import { CalendarDays, Users } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/features/auth/AuthProvider'
import { AttendanceCalendar } from './AttendanceCalendar'
import { CheckInCard } from './CheckInCard'
import { TeamAttendance } from './TeamAttendance'

export default function AttendancePage() {
  const { hasRole } = useAuth()
  const canSeeTeam = hasRole('admin', 'manager')
  const [params, setParams] = useSearchParams()
  const tab = canSeeTeam && params.get('tab') === 'team' ? 'team' : 'me'

  const mine = (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:gap-6">
      <CheckInCard className="lg:sticky lg:top-20" />
      <AttendanceCalendar />
    </div>
  )

  return (
    <>
      <PageHeader title="Attendance" description="Check in from the office and track your month." />
      {canSeeTeam ? (
        <Tabs value={tab} onValueChange={(v) => setParams(v === 'me' ? {} : { tab: v }, { replace: true })}>
          <TabsList aria-label="Attendance views">
            <TabsTrigger value="me">
              <CalendarDays aria-hidden />
              My attendance
            </TabsTrigger>
            <TabsTrigger value="team">
              <Users aria-hidden />
              {hasRole('admin') ? 'Everyone' : 'My team'}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="me">{mine}</TabsContent>
          <TabsContent value="team">
            <TeamAttendance />
          </TabsContent>
        </Tabs>
      ) : (
        mine
      )}
    </>
  )
}
