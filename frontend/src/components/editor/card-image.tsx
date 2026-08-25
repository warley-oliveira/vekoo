import { useMemo, type ReactNode } from "react"

import type { CarouselTheme, ImageSpec, ImageStyle, ImageTint } from "@/lib/doc"
import { mulberry32 } from "@/lib/doc"
import { findLibraryImage, libraryBackground } from "@/lib/image-library"
import { cn } from "@/lib/utils"

// A imagem do card, nas três origens. O enquadramento é o mesmo para todas:
// `focus` diz que ponto sobrevive ao corte e `zoom` o quanto se aproxima.

type CardImageProps = {
  image: ImageSpec
  theme: CarouselTheme
  className?: string
}

/** `object-position`/`background-position` a partir do foco (0 a 1). */
function framePosition(image: ImageSpec): string {
  return `${Math.round(image.focus.x * 100)}% ${Math.round(image.focus.y * 100)}%`
}

export function CardImage({ image, theme, className }: CardImageProps) {
  const { source } = image
  const position = framePosition(image)
  const zoom = Math.max(1, image.zoom)

  if (source.kind === "upload") {
    return (
      <img
        src={source.dataUrl}
        alt=""
        aria-hidden
        draggable={false}
        className={cn("h-full w-full object-cover", className)}
        style={{ objectPosition: position, transform: `scale(${zoom})` }}
      />
    )
  }

  if (source.kind === "library") {
    const piece = findLibraryImage(source.id)
    return (
      <div
        aria-hidden
        className={cn("h-full w-full", className)}
        style={{
          background: piece ? libraryBackground(piece) : theme.surface,
          backgroundPosition: position,
          transform: `scale(${zoom})`,
        }}
      />
    )
  }

  return (
    <ArtImage
      style={source.style}
      seed={source.seed}
      tint={source.tint}
      theme={theme}
      position={position}
      zoom={zoom}
      className={className}
    />
  )
}

/** Arte desenhada por especificação — não existe arquivo. */
function ArtImage({
  style,
  seed,
  tint,
  theme,
  position,
  zoom,
  className,
}: {
  style: ImageStyle
  seed: number
  tint: ImageTint
  theme: CarouselTheme
  position: string
  zoom: number
  className?: string
}) {
  const color =
    tint === "accent" ? theme.accent : tint === "ink" ? theme.ink : theme.bg
  const shapes = useMemo(() => buildShapes(style, seed, color), [style, seed, color])

  return (
    <svg
      aria-hidden
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
      className={cn("h-full w-full", className)}
      style={{ objectPosition: position, transform: `scale(${zoom})` }}
    >
      <rect width="100" height="100" fill={theme.surface} />
      {shapes}
    </svg>
  )
}

/** Arredonda para o SVG não carregar caudas de ponto flutuante. */
function r2(value: number): number {
  return Math.round(value * 100) / 100
}

function buildShapes(
  style: ImageStyle,
  seed: number,
  tint: string
): ReactNode[] {
  const rnd = mulberry32(seed)
  const shapes: ReactNode[] = []

  switch (style) {
    case "arc": {
      const cx = r2(22 + rnd() * 56)
      const cy = r2(25 + rnd() * 50)
      const rings = 4 + Math.floor(rnd() * 3)
      for (let i = 0; i < rings; i++) {
        shapes.push(
          <circle
            key={`ring-${i}`}
            cx={cx}
            cy={cy}
            r={r2(12 + i * (11 + rnd() * 4))}
            fill="none"
            stroke={tint}
            strokeWidth={r2(4.5 + rnd() * 3.5)}
            opacity={r2(Math.max(0.12, 0.85 - i * 0.16))}
          />
        )
      }
      shapes.push(
        <circle key="core" cx={cx} cy={cy} r={r2(4.5 + rnd() * 3.5)} fill={tint} opacity={0.9} />
      )
      break
    }
    case "waves": {
      const lines = 5
      for (let i = 0; i < lines; i++) {
        const y = r2(14 + i * (72 / lines) + rnd() * 5)
        const amp = r2(6 + rnd() * 9)
        shapes.push(
          <path
            key={`wave-${i}`}
            d={`M -5 ${y} Q 22 ${r2(y - amp)} 48 ${y} T 105 ${y}`}
            fill="none"
            stroke={tint}
            strokeWidth={r2(2 + rnd() * 2.5)}
            strokeLinecap="round"
            opacity={r2(0.3 + i * 0.13)}
          />
        )
      }
      break
    }
    case "dots": {
      for (let row = 0; row < 7; row++) {
        for (let col = 0; col < 7; col++) {
          const roll = rnd()
          const radius = r2(1.4 + rnd() * 2.6)
          if (roll > 0.85) continue
          shapes.push(
            <circle
              key={`dot-${row}-${col}`}
              cx={8 + col * 14}
              cy={8 + row * 14}
              r={radius}
              fill={tint}
              opacity={r2(0.3 + roll * 0.65)}
            />
          )
        }
      }
      break
    }
    case "grid": {
      for (let i = 1; i < 8; i++) {
        shapes.push(
          <line key={`v-${i}`} x1={i * 12.5} y1="0" x2={i * 12.5} y2="100" stroke={tint} strokeWidth={0.5} opacity={0.22} />,
          <line key={`h-${i}`} x1="0" y1={i * 12.5} x2="100" y2={i * 12.5} stroke={tint} strokeWidth={0.5} opacity={0.22} />
        )
      }
      const cells = 4 + Math.floor(rnd() * 3)
      for (let i = 0; i < cells; i++) {
        shapes.push(
          <rect
            key={`cell-${i}`}
            x={Math.floor(rnd() * 8) * 12.5}
            y={Math.floor(rnd() * 8) * 12.5}
            width="12.5"
            height="12.5"
            fill={tint}
            opacity={r2(0.45 + rnd() * 0.45)}
          />
        )
      }
      break
    }
    case "beams": {
      const baseAngle = r2(16 + rnd() * 16)
      const beams = 4 + Math.floor(rnd() * 3)
      for (let i = 0; i < beams; i++) {
        shapes.push(
          <rect
            key={`beam-${i}`}
            x={r2(-10 + rnd() * 105)}
            y="-35"
            width={r2(6 + rnd() * 14)}
            height="170"
            fill={tint}
            transform={`rotate(${r2(baseAngle + (rnd() - 0.5) * 8)} 50 50)`}
            opacity={r2(0.25 + rnd() * 0.6)}
          />
        )
      }
      break
    }
    case "blob": {
      const blobs = 3 + Math.floor(rnd() * 2)
      for (let i = 0; i < blobs; i++) {
        shapes.push(
          <ellipse
            key={`blob-${i}`}
            cx={r2(25 + rnd() * 50)}
            cy={r2(25 + rnd() * 50)}
            rx={r2(15 + rnd() * 22)}
            ry={r2(13 + rnd() * 20)}
            fill={tint}
            opacity={r2(0.22 + rnd() * 0.45)}
          />
        )
      }
      shapes.push(
        <circle key="spark" cx={r2(20 + rnd() * 60)} cy={r2(20 + rnd() * 60)} r={r2(3 + rnd() * 3)} fill={tint} opacity={0.9} />
      )
      break
    }
  }

  return shapes
}
