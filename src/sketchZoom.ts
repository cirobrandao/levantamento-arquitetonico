import { useCallback, useRef, useState } from 'react'
import type { RefObject, TouchEvent } from 'react'
import { SKETCH_BOUNDS } from './sketchDrag'

// Zoom/pan do croqui só na visualização: altera o viewBox do SVG, nunca as medidas nem a geometria.
export interface View { x: number; y: number; w: number; h: number }
export const FULL_VIEW: View = { x: 0, y: 0, w: SKETCH_BOUNDS.width, h: SKETCH_BOUNDS.height }
export const MAX_ZOOM = 6
export const zoomOf = (view: View) => FULL_VIEW.w / view.w
export function clampView(view: View): View {
  const w = Math.min(FULL_VIEW.w, Math.max(FULL_VIEW.w / MAX_ZOOM, view.w)), h = w * FULL_VIEW.h / FULL_VIEW.w
  return { w, h, x: Math.min(FULL_VIEW.w - w, Math.max(0, view.x)), y: Math.min(FULL_VIEW.h - h, Math.max(0, view.y)) }
}
// Aproxima/afasta mantendo fixo o ponto (fx, fy) — frações 0..1 da área visível.
export function zoomAt(view: View, factor: number, fx = .5, fy = .5): View {
  const w = view.w / factor, h = view.h / factor
  return clampView({ w, h, x: view.x + (view.w - w) * fx, y: view.y + (view.h - h) * fy })
}
export const panBy = (view: View, dx: number, dy: number): View => clampView({ ...view, x: view.x - dx, y: view.y - dy })

type Gesture = { kind: 'pinch'; distance: number; view: View; mid: { x: number; y: number } } | { kind: 'pan'; x: number; y: number; view: View }
export function useSketchZoom(svgRef: RefObject<SVGSVGElement | null>, { panEnabled }: { panEnabled: boolean }) {
  const [view, setView] = useState<View>(FULL_VIEW)
  const gesture = useRef<Gesture>(undefined)
  const rect = () => svgRef.current?.getBoundingClientRect()
  const onTouchStart = useCallback((event: TouchEvent) => {
    const box = rect(); if (!box?.width) return
    if (event.touches.length === 2) {
      const [a, b] = [event.touches[0], event.touches[1]]
      const fx = ((a.clientX + b.clientX) / 2 - box.left) / box.width, fy = ((a.clientY + b.clientY) / 2 - box.top) / box.height
      gesture.current = { kind: 'pinch', distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1, view, mid: { x: view.x + fx * view.w, y: view.y + fy * view.h } }
    } else if (event.touches.length === 1 && panEnabled && zoomOf(view) > 1.01) gesture.current = { kind: 'pan', x: event.touches[0].clientX, y: event.touches[0].clientY, view }
  }, [view, panEnabled])
  const onTouchMove = useCallback((event: TouchEvent) => {
    const g = gesture.current, box = rect(); if (!g || !box?.width) return
    if (g.kind === 'pinch' && event.touches.length === 2) {
      const [a, b] = [event.touches[0], event.touches[1]]
      const scale = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / g.distance
      const w = g.view.w / scale, h = g.view.h / scale
      const fx = ((a.clientX + b.clientX) / 2 - box.left) / box.width, fy = ((a.clientY + b.clientY) / 2 - box.top) / box.height
      setView(clampView({ w, h, x: g.mid.x - fx * w, y: g.mid.y - fy * h }))
    } else if (g.kind === 'pan' && event.touches.length === 1) {
      const ratio = g.view.w / box.width
      setView(panBy(g.view, (event.touches[0].clientX - g.x) * ratio, (event.touches[0].clientY - g.y) * ratio))
    }
  }, [])
  const onTouchEnd = useCallback((event: TouchEvent) => { if (event.touches.length === 0) gesture.current = undefined; else onTouchStart(event) }, [onTouchStart])
  const zoomed = zoomOf(view) > 1.01
  return {
    view, zoomed, zoom: zoomOf(view), viewBox: `${view.x} ${view.y} ${view.w} ${view.h}`,
    handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd },
    zoomIn: () => setView(current => zoomAt(current, 1.5)), zoomOut: () => setView(current => zoomAt(current, 1 / 1.5)), reset: () => setView(FULL_VIEW),
  }
}
