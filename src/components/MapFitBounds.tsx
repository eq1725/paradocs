'use client'

import { useEffect } from 'react'
import { useMap } from 'react-leaflet'

interface Props {
  bounds: [[number, number], [number, number]] | null
}

export default function MapFitBounds(props: Props) {
  var map = useMap()

  useEffect(function() {
    if (props.bounds && map) {
      map.fitBounds(props.bounds, { padding: [20, 20], animate: false })
    }
  }, [props.bounds, map])

  return null
}
