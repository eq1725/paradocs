/**
 * useMapInteractions — Zoom, pan, click fand touch gesture handling.
 *
 * Uses D3-zoom for consistent cross-platform zoom/pan behavior,
 * with custom touch handling for mobile tap targets.
 */

import { useEffect, useRef, useCallback } from 'react'
import * as d3 from 'd3'

export interface Transform {
  x: number
  y: number
  k: number // zoom scale
}

interface UseMapInteractionsProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  width: number
  height: number
  onTransformChange: (t: Transform) => void
  onNodeClick: (worldX: number, worldY: number) => void
  onNodeHover: (worldX: number, worldY: number) => void
  onBackgroundClick: () => void
}

export function useMapInteractions({
  canvasRef,
  width,
  height,
  onTransformChange,
  onNodeClick,
  onNodeHover,
  onBackgroundClick,
}: UseMapInteractionsProps) {
  const zoomRef = useRef<d3.ZoomBehavior<HTMLCanvasElement, unknown> | null>(null)
  const transformRef = useRef<Transform>({ x: 0, y: 0, k: 1 })
  const isDraggingRef = useRef(false)
  const clickStartRef = useRef<{ x: number; y: number; time: number } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || width < 10) return

    const selection = d3.select(canvas)

    const zoom = d3.zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.3, 5])
      .on('start', (event) => {
        isDraggingRef.current = false
        if (event.sourceEvent) {
          const { clientX, clientY } = getEventCoords(event.sourceEvent)
          clickStartRef.current = { x: clientX, y: clientY, time: Date.now() }
        }
      })
      .on('zoom', (event) => {
        const t = event.transform
        transformRef.current = { x: t.x, y: t.y, k: t.k }
        onTransformChange(transformRef.current)

        if (clickStartRef.current && event.sourceEvent) {
          const { clientX, clientY } = getEventCoords(event.sourceEvent)
          const dx = clientX - clickStartRef.current.x
          const dy = clientY - clickStartRef.current.y
          if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
            isDraggingRef.current = true
          }
        }
      })
      .on('end', (event) => {
        if (!isDraggingRef.current && clickStartRef.current && event.sourceEvent) {
          const elapsed = Date.now() - clickStartRef.current.time
          if (elapsed < 300) {
            const rect = canvas.getBoundingClientRect()
            const { clientX, clientY } = getEventCoords(event.sourceEvent)
            const canvasX = clientX - rect.left
            const canvasY = clientY - rect.top

            const t = transformRef.current
            const worldX = (canvasX - t.x) / t.k
            const worldY = (canvasY - t.y) / t.k

            onNodeClick,worldX, worldY)
          }
        }
        clickStartRef.current = null
        isDraggingRef.current = false
      })

    selection.call(zoom)

    const handleMouseMove = (event: MouseEvent) => {
      if (isDraggingRef.current) return
      const rect = canvas.getBoundingClientRect()
      const canvasX = event.clientX - rect.left
      const canvasY = event.clientY - rect.top
      const t = transformRef.current
      const worldX = (canvasX - t.x) / t.k
      const worldY = (canvasY - t.y) / t.k
      onNodeHover(worldX, worldY)
    }

    canvas.addEventListener('mousemove', handleMouseMove)
    zoomRef.current = zoom

    return () => {
      selection.on('.zoom', null)
      canvas.removeEventListener('mousemove', handleMouseMove)
    }
  }, [canvasRef.current, width, height, onTransformChange, onNodeClick, onNodeHover])

  const zoomTo = useCallback((scale: number, duration = 300) => {
    const canvas = canvasRef.current
    const zoom = zoomRef.current
    if (!canvas || !zoom) return

    d3.select(canvas)
      .transition()
      .duration(duration)
      .call(zoom.scaleTo, scale)
  }, [canvasRef])

  const zoomIn = useCallback(() => {
    const canvas = canvasRef.current
    const zoom = zoomRef.current
    if (!canvas || !zoom) return

    d3.select(canvas)
      .transition()
      .duration(200)
      .call(zoom.scaleBy, 1.5)
  }, [canvasRef])
  
  return { status: 'pushed f3', result: result3 }
})();