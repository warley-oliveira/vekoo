import { useLayoutEffect, useRef } from "react"
import { NavLink, useLocation } from "react-router"

import { cn } from "@/lib/utils"

export type AreaNavItem = { to: string; label: string }

/**
 * Abas de uma área de configurações, cada uma com a sua rota: o endereço diz onde se está,
 * e o botão voltar funciona. Em tela estreita, rola de lado em vez de quebrar a linha, e a
 * aba ativa fica à vista.
 */
export function AreaNav({ label, items }: { label: string; items: AreaNavItem[] }) {
  const navRef = useRef<HTMLElement>(null)
  const { pathname } = useLocation()

  // Mexe só no `scrollLeft`: `scrollIntoView` poderia rolar a página junto.
  useLayoutEffect(() => {
    const nav = navRef.current
    const active = nav?.querySelector('[aria-current="page"]')
    if (!nav || !active) return
    const navBox = nav.getBoundingClientRect()
    const activeBox = active.getBoundingClientRect()
    nav.scrollLeft += activeBox.left - navBox.left - (navBox.width - activeBox.width) / 2
  }, [pathname, items.length])

  return (
    <nav
      ref={navRef}
      aria-label={label}
      className="-mx-4 overflow-x-auto border-b px-4 [scrollbar-width:none] md:mx-0 md:px-0"
    >
      {/* Margem negativa: o texto da primeira aba alinha com o conteúdo, e não a área de clique. */}
      <ul className="-ml-2.5 flex min-w-max gap-1 md:gap-2">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end
              className={({ isActive }) =>
                cn(
                  "relative flex h-10 items-center rounded-t-md px-2.5 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset",
                  isActive
                    ? "text-foreground after:absolute after:inset-x-2.5 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary"
                    : "text-muted-foreground hover:text-foreground"
                )
              }
            >
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
