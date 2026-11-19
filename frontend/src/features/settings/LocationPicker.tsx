import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { Crosshair, Loader2, MapPin, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Circle, MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export interface LatLng {
  lat: number
  lng: number
}

interface Props {
  value: LatLng | null
  radius: number
  onChange: (pos: LatLng, address?: string) => void
}

interface NominatimResult {
  place_id: number
  lat: string
  lon: string
  display_name: string
}

const DEFAULT_CENTER: LatLng = { lat: 20.5937, lng: 78.9629 } // India
const NOMINATIM = 'https://nominatim.openstreetmap.org'

// CSS-only pin avoids Leaflet's bundled marker-image path issues.
const pinIcon = L.divIcon({
  className: '',
  html: `<div style="transform:translate(-50%,-100%);width:32px;height:40px;position:absolute;left:0;top:0">
    <svg viewBox="0 0 32 40" width="32" height="40" aria-hidden="true"><path d="M16 0C7.2 0 0 7 0 15.7 0 27.5 16 40 16 40s16-12.5 16-24.3C32 7 24.8 0 16 0z" fill="#4f46e5"/><circle cx="16" cy="15.5" r="6" fill="#fff"/></svg>
  </div>`,
  iconSize: [0, 0],
})

async function reverseGeocode(p: LatLng): Promise<string | undefined> {
  try {
    const r = await fetch(`${NOMINATIM}/reverse?format=jsonv2&zoom=18&lat=${p.lat}&lon=${p.lng}`, {
      headers: { 'Accept-Language': 'en' },
    })
    if (!r.ok) return undefined
    const data = (await r.json()) as { display_name?: string }
    return data.display_name
  } catch {
    return undefined
  }
}

function ClickToPlace({ onPick }: { onPick: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) })
  return null
}

/** Keeps the map sized correctly inside animated dialogs/sheets and recenters on external changes. */
function MapController({ center, zoom }: { center: LatLng | null; zoom: number }) {
  const map = useMap()
  useEffect(() => {
    const el = map.getContainer()
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(el)
    return () => ro.disconnect()
  }, [map])
  useEffect(() => {
    if (center) map.flyTo([center.lat, center.lng], Math.max(map.getZoom(), zoom), { duration: 0.4 })
  }, [center, zoom, map])
  return null
}

export default function LocationPicker({ value, radius, onChange }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<NominatimResult[]>([])
  const [searching, setSearching] = useState(false)
  const [locating, setLocating] = useState(false)
  const [flyTarget, setFlyTarget] = useState<LatLng | null>(null)
  const markerRef = useRef<L.Marker>(null)
  const initialCenter = useMemo(() => value ?? DEFAULT_CENTER, []) // eslint-disable-line react-hooks/exhaustive-deps

  const place = (p: LatLng, address?: string, fly = false) => {
    onChange(p, address)
    if (fly) setFlyTarget(p)
  }

  // Nominatim usage policy: on explicit submit only (no autocomplete), max ~1 req/s.
  // Not a <form>: this sits inside the location dialog's form, and nested forms are invalid HTML.
  const search = async (e?: { preventDefault: () => void }) => {
    e?.preventDefault()
    const q = query.trim()
    if (q.length < 3) return
    setSearching(true)
    try {
      const r = await fetch(`${NOMINATIM}/search?format=jsonv2&limit=5&q=${encodeURIComponent(q)}`, {
        headers: { 'Accept-Language': 'en' },
      })
      const data = (await r.json()) as NominatimResult[]
      setResults(data)
      if (data.length === 0) toast.info('No places found. Try a more specific address.')
    } catch {
      toast.error('Search is unavailable right now. Drop the pin on the map instead.')
    } finally {
      setSearching(false)
    }
  }

  const useMyLocation = () => {
    if (!('geolocation' in navigator)) return toast.error('Location isn’t supported on this device.')
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        place(p, await reverseGeocode(p), true)
        setLocating(false)
        if (pos.coords.accuracy > 100) toast.warning(`Location accuracy is low (±${Math.round(pos.coords.accuracy)} m). Adjust the pin if needed.`)
      },
      (err) => {
        setLocating(false)
        toast.error(err.code === err.PERMISSION_DENIED ? 'Location permission denied.' : 'Couldn’t get your location.')
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2" role="search">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search address or place, then press Enter"
            className="pl-9"
            aria-label="Search for an address"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void search(e) // preventDefault stops the outer form submitting
            }}
          />
        </div>
        <Button type="button" variant="outline" size="icon" loading={searching} aria-label="Search" onClick={() => void search()}>
          {!searching && <Search />}
        </Button>
        <Button type="button" variant="outline" size="icon" onClick={useMyLocation} disabled={locating} aria-label="Use my current location">
          {locating ? <Loader2 className="animate-spin" /> : <Crosshair />}
        </Button>
      </div>

      {results.length > 0 && (
        <ul className="max-h-44 overflow-y-auto rounded-xl border border-border bg-card p-1" aria-label="Search results">
          {results.map((r) => (
            <li key={r.place_id}>
              <button
                type="button"
                onClick={() => {
                  place({ lat: Number(r.lat), lng: Number(r.lon) }, r.display_name, true)
                  setResults([])
                }}
                className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-accent"
              >
                <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="line-clamp-2">{r.display_name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative h-72 overflow-hidden rounded-xl border border-border sm:h-80">
        <MapContainer
          center={[initialCenter.lat, initialCenter.lng]}
          zoom={value ? 17 : 4}
          className="size-full"
          scrollWheelZoom
          attributionControl
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
          <ClickToPlace onPick={(p) => place(p)} />
          <MapController center={flyTarget} zoom={17} />
          {value && (
            <>
              <Circle
                center={[value.lat, value.lng]}
                radius={radius}
                pathOptions={{ color: '#4f46e5', weight: 2, fillColor: '#6366f1', fillOpacity: 0.15 }}
              />
              <Marker
                ref={markerRef}
                position={[value.lat, value.lng]}
                icon={pinIcon}
                draggable
                keyboard={false}
                eventHandlers={{
                  dragend: () => {
                    const ll = markerRef.current?.getLatLng()
                    if (ll) place({ lat: ll.lat, lng: ll.lng })
                  },
                }}
              />
            </>
          )}
        </MapContainer>
        {!value && (
          <div className="pointer-events-none absolute inset-x-0 top-3 z-[400] flex justify-center">
            <span className="rounded-full bg-card/95 px-3 py-1.5 text-xs font-medium shadow-md">Tap the map to drop a pin</span>
          </div>
        )}
      </div>
      {value && (
        <p className="tabular text-xs text-muted-foreground">
          {value.lat.toFixed(6)}, {value.lng.toFixed(6)} · Drag the pin or tap the map to adjust
        </p>
      )}
    </div>
  )
}
