import { useCallback, useEffect, useRef, useState } from "react"

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function readFromStorage(key: string, defaultWidth: number, min: number, max: number): number {
  const stored = localStorage.getItem(key)
  if (stored === null) return defaultWidth
  const parsed = Number(stored)
  if (!Number.isFinite(parsed)) return defaultWidth
  return clamp(parsed, min, max)
}

export function useResizablePanel(
  key: string,
  defaultWidth: number,
  min: number,
  max: number,
): { width: number; handleMouseDown: React.MouseEventHandler } {
  const [width, setWidth] = useState(() => readFromStorage(key, defaultWidth, min, max))
  const widthRef = useRef(width)
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null)

  useEffect(() => {
    widthRef.current = width
  }, [width])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragState.current = { startX: e.clientX, startWidth: widthRef.current }
  }, [])

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (dragState.current === null) return
      const delta = dragState.current.startX - e.clientX
      setWidth(clamp(dragState.current.startWidth + delta, min, max))
    }

    function onMouseUp() {
      if (dragState.current === null) return
      dragState.current = null
      setWidth((current) => {
        localStorage.setItem(key, String(current))
        return current
      })
    }

    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp)
    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
    }
  }, [key, min, max])

  return { width, handleMouseDown }
}
