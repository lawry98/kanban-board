"use client"

import React, { useEffect, useId, useRef, useState } from "react"
import { motion } from "motion/react"

import { cn } from "@/lib/utils"

interface DotPatternProps extends React.SVGProps<SVGSVGElement> {
  width?: number
  height?: number
  x?: number
  y?: number
  cx?: number
  cy?: number
  cr?: number
  className?: string
  glow?: boolean
  [key: string]: unknown
}

export function DotPattern({
  width = 16,
  height = 16,
  x = 0,
  y = 0,
  cx = 1,
  cy = 1,
  cr = 1,
  className,
  glow = false,
  ...props
}: DotPatternProps) {
  const id = useId()
  const containerRef = useRef<SVGSVGElement>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  useEffect(() => {
    if (!glow) return

    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setDimensions({ width: rect.width, height: rect.height })
      }
    }

    updateDimensions()
    window.addEventListener("resize", updateDimensions)
    return () => window.removeEventListener("resize", updateDimensions)
  }, [glow])

  // Non-glow: SVG <pattern> tiles dots to fill the container without JS measurement.
  // suppressHydrationWarning is required because useId() generates different values
  // when ThemeProvider shifts the React fiber counter between server and client.
  if (!glow) {
    return (
      <svg
        suppressHydrationWarning
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 h-full w-full text-neutral-400/80",
          className,
        )}
        {...props}
      >
        <defs>
          <pattern
            suppressHydrationWarning
            id={`${id}-dots`}
            x={x}
            y={y}
            width={width}
            height={height}
            patternUnits="userSpaceOnUse"
          >
            <circle cx={cx} cy={cy} r={cr} fill="currentColor" />
          </pattern>
        </defs>
        <rect suppressHydrationWarning width="100%" height="100%" fill={`url(#${id}-dots)`} />
      </svg>
    )
  }

  // Glow mode: individual animated dots with random delays (needs container dimensions).
  const dots = Array.from(
    {
      length:
        Math.ceil(dimensions.width / width) * Math.ceil(dimensions.height / height),
    },
    (_, i) => {
      const col = i % Math.ceil(dimensions.width / width)
      const row = Math.floor(i / Math.ceil(dimensions.width / width))
      return {
        x: col * width + cx,
        y: row * height + cy,
        delay: Math.random() * 5,
        duration: Math.random() * 3 + 2,
      }
    },
  )

  return (
    <svg
      ref={containerRef}
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 h-full w-full text-neutral-400/80",
        className,
      )}
      {...props}
    >
      <defs>
        <radialGradient suppressHydrationWarning id={`${id}-gradient`}>
          <stop offset="0%" stopColor="currentColor" stopOpacity="1" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
      </defs>
      {dots.map((dot) => (
        <motion.circle
          key={`${dot.x}-${dot.y}`}
          cx={dot.x}
          cy={dot.y}
          r={cr}
          fill={`url(#${id}-gradient)`}
          initial={{ opacity: 0.4, scale: 1 }}
          animate={{
            opacity: [0.4, 1, 0.4],
            scale: [1, 1.5, 1],
          }}
          transition={{
            duration: dot.duration,
            repeat: Infinity,
            repeatType: "reverse",
            delay: dot.delay,
            ease: "easeInOut",
          }}
        />
      ))}
    </svg>
  )
}
