import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet.markercluster'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import { iconFor, MOROCCO_CENTER } from '../lib/constants'
import type { Incident, TrafficInfo } from '../lib/types'

export interface MapMarker { id: string; lat: number; lng: number; label?: string; emoji?: string }
interface Props {
  incidents?: Incident[]
  onSelect?: (i: Incident) => void
  onMapClick?: (p: { lat: number; lng: number }) => void
  pin?: { lat: number; lng: number } | null
  onPinDrag?: (p: { lat: number; lng: number }) => void
  markers?: MapMarker[]
  route?: [number, number][][] // each: [lng,lat][]
  user?: { lat: number; lng: number } | null
  flyTo?: { lat: number; lng: number; zoom?: number; nonce: number } | null
  fitRoute?: boolean
  traffic?: TrafficInfo | null
  className?: string
}
const LEVEL_COLOR: Record<string, string> = { free: '#1a9850', moderate: '#f6a800', heavy: '#d73027', blocked: '#7f0000' }
const STATUS_RING: Record<string, string> = { CONFIRMED: '#1a9850', PENDING: '#f6a800' }

const divIcon = (i: Incident) => L.divIcon({
  className: 'tm-marker', iconSize: [36, 36], iconAnchor: [18, 18],
  html: `<div class="tm-pin" style="border-color:${STATUS_RING[i.status] ?? '#999'}">${iconFor(i.type)}</div>`,
})

export default function MapView({ incidents = [], onSelect, onMapClick, pin, onPinDrag, markers = [], route = [], user, flyTo, fitRoute, traffic, className }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const cluster = useRef<L.MarkerClusterGroup | null>(null)
  const overlay = useRef<L.LayerGroup>(L.layerGroup())
  const pinRef = useRef<L.Marker | null>(null)
  const cb = useRef({ onSelect, onMapClick, onPinDrag })
  cb.current = { onSelect, onMapClick, onPinDrag }

  useEffect(() => {
    const m = L.map(el.current!, { zoomControl: false }).setView(MOROCCO_CENTER, 6)
    map.current = m
    L.control.zoom({ position: 'bottomright' }).addTo(m)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors', maxZoom: 19 }).addTo(m)
    cluster.current = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 50, spiderfyOnMaxZoom: true }).addTo(m)
    overlay.current.addTo(m)
    m.on('click', (e: L.LeafletMouseEvent) => cb.current.onMapClick?.({ lat: e.latlng.lat, lng: e.latlng.lng }))
    const ro = new ResizeObserver(() => m.invalidateSize()); ro.observe(el.current!)
    return () => { ro.disconnect(); m.remove(); map.current = null }
  }, [])

  useEffect(() => {
    const g = cluster.current; if (!g) return
    g.clearLayers()
    g.addLayers(incidents.map(i => L.marker([i.latitude, i.longitude], { icon: divIcon(i), keyboard: true, title: i.type }).on('click', () => cb.current.onSelect?.(i))))
  }, [incidents])

  useEffect(() => {
    const m = map.current; if (!m) return
    pinRef.current?.remove(); pinRef.current = null
    if (pin) {
      pinRef.current = L.marker([pin.lat, pin.lng], { draggable: !!onPinDrag }).addTo(m)
      pinRef.current.on('dragend', () => { const p = pinRef.current!.getLatLng(); cb.current.onPinDrag?.({ lat: p.lat, lng: p.lng }) })
    }
  }, [pin?.lat, pin?.lng, !!onPinDrag]) // eslint-disable-line react-hooks/exhaustive-deps

  // route lines, extra markers, user dot, live-traffic readings
  useEffect(() => {
    const m = map.current; if (!m) return
    const o = overlay.current; o.clearLayers()
    const bounds: L.LatLngTuple[] = []
    route.forEach((line, idx) => {
      const ll = line.map(([x, y]) => [y, x] as L.LatLngTuple)
      L.polyline(ll, { color: idx === 0 ? '#1d4ed8' : '#6b7280', weight: idx === 0 ? 6 : 4, opacity: idx === 0 ? 0.9 : 0.6, dashArray: idx === 0 ? undefined : '8 8' }).addTo(o)
      bounds.push(...ll)
    })
    markers.forEach(mk => L.marker([mk.lat, mk.lng], { icon: L.divIcon({ className: 'tm-marker', iconSize: [34, 34], iconAnchor: [17, 30], html: `<div class="tm-flag">${mk.emoji ?? '📍'}</div>` }), title: mk.label }).addTo(o))
    if (user) L.circleMarker([user.lat, user.lng], { radius: 8, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }).addTo(o)
    if (traffic?.available) traffic.data.forEach(d => L.circleMarker([d.lat, d.lng], { radius: 10, color: LEVEL_COLOR[d.level] ?? '#888', fillOpacity: 0.55, weight: 2 }).bindTooltip(`${traffic.provider}: ${d.level}`).addTo(o))
    if (fitRoute && bounds.length) m.fitBounds(L.latLngBounds(bounds), { padding: [40, 40] })
  }, [route, markers, user, traffic, fitRoute])

  useEffect(() => { if (flyTo) map.current?.flyTo([flyTo.lat, flyTo.lng], flyTo.zoom ?? 13) }, [flyTo?.nonce]) // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={el} className={className ?? 'map'} role="application" aria-label="map" />
}
