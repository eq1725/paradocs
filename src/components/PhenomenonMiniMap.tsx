'use client'

import React, { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { MapPin } from 'lucide-react'

var MapContainer = dynamic(
  function() { return import('react-leaflet').then(function(mod) { return mod.MapContainer; }); },
  { ssr: false }
)
var TileLayer = dynamic(
  function() { return import('react-leaflet').then(function(mod) { return mod.TileLayer; }); },
  { ssr: false }
)
var MarkerComp = dynamic(
  function() { return import('react-leaflet').then(function(mod) { return mod.Marker; }); },
  { ssr: false }
)
var PopupComp = dynamic(
  function() { return import('react-leaflet').then(function(mod) { return mod.Popup; }); },
  { ssr: false }
)

interface LocationPoint {
  lat: number
  lng: number
  label: string
  type: 'region' | 'report'
}

interface Props {
  regions: string[]
  phenomenonName: string
  reportLocations?: Array<{ lat: number; lng: number; title: string }>
}

export default function PhenomenonMiniMap(props: Props) {
  var regions = props.regions
  var phenomenonName = props.phenomenonName
  var reportLocations = props.reportLocations || []

  var [locations, setLocations] = useState<LocationPoint[]>([])
  var [mounted, setMounted] = useState(false)
  var [leaflet, setLeaflet] = useState<any>(null)
  var [loading, setLoading] = useState(true)
  var [mapBounds, setMapBounds] = useState<[[number, number], [number, number]] | null>(null)

  useEffect(function() {
    setMounted(true)
    import('leaflet').then(function(L) {
      setLeaflet(L.default)
    })
  }, [])

  useEffect(function() {
    if (!regions || regions.length === 0) {
      setLoading(false)
      return
    }
    fetchGeocodedRegions()
  }, [regions])

  function fetchGeocodedRegions() {
    fetch('/api/geocode/regions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ regions: regions })
    })
      .then(function(res) { return res.json(); })
      .then(function(data) {
        var points: LocationPoint[] = []
        if (data.locations) {
          data.locations.forEach(function(loc: any) {
            points.push({ lat: loc.lat, lng: loc.lng, label: loc.region, type: 'region' })
          })
        }

        reportLocations.forEach(function(rl) {
          points.push({ lat: rl.lat, lng: rl.lng, label: rl.title, type: 'report' })
        })

        setLocations(points)

        if (points.length > 0) {
          var minLat = points[0].lat
          var maxLat = points[0].lat
          var minLng = points[0].lng
          var maxLng = points[0].lng
          points.forEach(function(p) {
            if (p.lat < minLat) minLat = p.lat
            if (p.lat > maxLat) maxLat = p.lat
            if (p.lng < minLng) minLng = p.lng
            if (p.lng > maxLng) maxLng = p.lng
          })
          var latPad = Math.max((maxLat - minLat) * 0.3, 2)
          var lngPad = Math.max((maxLng - minLng) * 0.3, 2)
          setMapBounds([
            [minLat - latPad, minLng - lngPad],
            [maxLat + latPad, maxLng + lngPad]
          ])
        }

        setLoading(false)
      })
      .catch(function() {
        setLoading(false)
      })
  }

  if (!regions || regions.length === 0) return null

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-semibold text-white">Reported Locations</h3>
        </div>
        {!loading && locations.length > 0 && (
          <p className="text-xs text-gray-500 mt-1">
            {locations.length + ' known ' + (locations.length === 1 ? 'region' : 'regions')}
          </p>
        )}
      </div>

      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
        crossOrigin=""
      />
      <style>{[
        '.phenom-marker { background: transparent !important; border: none !important; }',
        '.leaflet-popup-content-wrapper { background: rgba(15, 23, 42, 0.95) !important; border: 1px solid rgba(255,255,255,0.1) !important; border-radius: 8px !important; }',
        '.leaflet-popup-content { color: white !important; margin: 8px 12px !important; }',
        ".leaflet-popup-tip { background: rgba(15, 23, 42, 0.95) !important; }"
      ].join(' ')}</style>

      <div className="h-52 relative bg-gray-950">
        {!mounted || !leaflet || loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : locations.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-gray-600 text-xs">No location data available</p>
          </div>
        ) : (
          <MapContainer
            bounds={mapBounds || undefined}
            center={mapBounds ? undefined : [20, 0]}
            zoom={mapBounds ? undefined : 2}
            style={{ height: '100%', width: '100%' }}
            zoomControl={false}
            scrollWheelZoom={false}
            dragging={true}
            attributionControl={false}
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            />
            {locations.map(function(loc, i) {
              var isReport = loc.type === 'report';
              var size = isReport ? 10 : 14;
              var color = isReport ? '#60a5fa' : '#a855f7';
              var border = isReport ? '#93c5fd' : '#c084fc';
              var glow = isReport ? 'rgba(96, 165, 250, 0.5)' : 'rgba(168, 85, 247, 0.6)';
              var icon = leaflet.divIcon({
                html: '<div style="width: ' + size + 'px; height: ' + size + 'px; border-radius: 50%; background: ' + color + '; border: 2px solid ' + border + '; box-shadow: 0 0 10px ' + glow + ';"></div>',
                className: 'phenom-marker',
                iconSize: [size, size],
                iconAnchor: [size / 2, size / 2],
                popupAnchor: [0, -(size / 2)]
              })
              return React.createElement(MarkerComp, {
                key: i,
                position: [loc.lat, loc.lng],
                icon: icon
              },
                React.createElement(PopupComp, null,
                  React.createElement('div', { className: 'text-xs' },
                    React.createElement('p', { className: 'font-medium text-white' }, loc.label),
                    React.createElement('p', { className: 'text-gray-400 mt-0.5' },
                      loc.type === 'region' ? 'Known region' : 'Report location'
                    )
                  )
                )
              )
            })}
          </MapContainer>
        )}
      </div>

      {/* Location tags */}
      {locations.length > 0 && (
        <div className="p-3 border-t border-gray-800">
          <div className="flex flex-wrap gap-1.5">
            {locations.map(function(loc, i) {
              return (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 bg-purple-900/30 text-purple-300 text-xs px-2 py-0.5 rounded-full border border-purple-500/20"
                >
                  <MapPin className="w-2.5 h-2.5" />
                  {loc.label}
                </span>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
