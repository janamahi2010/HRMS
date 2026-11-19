import { Building2, CalendarHeart, Clock, MapPin, Palmtree } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { GeneralTab } from './GeneralTab'
import { HolidaysTab } from './HolidaysTab'
import { LeaveTypesTab } from './LeaveTypesTab'
import { LocationsTab } from './LocationsTab'
import { WorkRulesTab } from './WorkRulesTab'

const TABS = [
  { value: 'general', label: 'Company', icon: Building2 },
  { value: 'locations', label: 'Office locations', icon: MapPin },
  { value: 'rules', label: 'Work rules', icon: Clock },
  { value: 'holidays', label: 'Holidays', icon: CalendarHeart },
  { value: 'leave', label: 'Leave types', icon: Palmtree },
] as const

export default function SettingsPage() {
  const [params, setParams] = useSearchParams()
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab')! : 'general'

  return (
    <>
      <PageHeader title="Company settings" description="Set up your company, offices, timings, holidays and leave types." />
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <TabsList aria-label="Settings sections" className="max-w-full overflow-x-auto">
          {TABS.map(({ value, label, icon: Icon }) => (
            <TabsTrigger key={value} value={value}>
              <Icon aria-hidden />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="general">
          <GeneralTab />
        </TabsContent>
        <TabsContent value="locations">
          <LocationsTab />
        </TabsContent>
        <TabsContent value="rules">
          <WorkRulesTab />
        </TabsContent>
        <TabsContent value="holidays">
          <HolidaysTab />
        </TabsContent>
        <TabsContent value="leave">
          <LeaveTypesTab />
        </TabsContent>
      </Tabs>
    </>
  )
}
