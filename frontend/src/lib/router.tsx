/* eslint-disable react/only-export-components */
// O react-router do app, com a organização da aba embutida.
//
// Toda tela da plataforma mora em `/a/<hashid>/...` (ver `lib/account-scope.ts`), mas as telas
// continuam falando dos caminhos de sempre: `<Link to="/chat">`, `navigate("/contacts/1")`,
// `useLocation().pathname === "/chat"`. Este módulo faz a ponte, dentro de `AccountRouteScope`:
//
//   - `Link`, `NavLink`, `Navigate` e `useNavigate` põem o prefixo em todo caminho absoluto que
//     não seja de conta (`/login`, `/organizations`…) nem já tenha prefixo;
//   - `useLocation` devolve o caminho sem o prefixo, para quem compara rota (menu, abas, guarda).
//
// Fora de uma organização (entrada, escolha de organização), nada muda. Por isso todo o app
// importa daqui, e não de "react-router" direto (o lint confere).
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react"
import * as RR from "react-router"

import { accountPath, stripAccountPath } from "@/lib/account-scope"

export * from "react-router"

const AccountRouteContext = createContext<string | null>(null)

/** Dentro disto, os caminhos absolutos ganham o prefixo da organização `hashid`. */
export function AccountRouteScope({
  hashid,
  children,
}: {
  hashid: string
  children: ReactNode
}) {
  return <AccountRouteContext.Provider value={hashid}>{children}</AccountRouteContext.Provider>
}

/** O hashid da organização da aba, para quem precisa montar um link à mão (`href`, `window.open`). */
export function useAccountHashid(): string | null {
  return useContext(AccountRouteContext)
}

function prefixTo(hashid: string | null, to: RR.To): RR.To {
  if (!hashid) return to
  if (typeof to === "string") return accountPath(hashid, to)
  if (to.pathname === undefined) return to
  return { ...to, pathname: accountPath(hashid, to.pathname) }
}

/** Para `href` e `window.open`: o mesmo prefixo que os links levam. */
export function useAccountHref(): (path: string) => string {
  const hashid = useAccountHashid()
  return useCallback((path: string) => (hashid ? accountPath(hashid, path) : path), [hashid])
}

export const Link = forwardRef<HTMLAnchorElement, RR.LinkProps>(function Link(props, ref) {
  const hashid = useAccountHashid()
  return <RR.Link ref={ref} {...props} to={prefixTo(hashid, props.to)} />
})

export const NavLink = forwardRef<HTMLAnchorElement, RR.NavLinkProps>(function NavLink(props, ref) {
  const hashid = useAccountHashid()
  return <RR.NavLink ref={ref} {...props} to={prefixTo(hashid, props.to)} />
})

export function Navigate(props: RR.NavigateProps) {
  const hashid = useAccountHashid()
  return <RR.Navigate {...props} to={prefixTo(hashid, props.to)} />
}

export function useNavigate(): RR.NavigateFunction {
  const navigate = RR.useNavigate()
  const hashid = useAccountHashid()
  return useCallback(
    ((to: RR.To | number, options?: RR.NavigateOptions) => {
      if (typeof to === "number") return navigate(to)
      return navigate(prefixTo(hashid, to), options)
    }) as RR.NavigateFunction,
    [navigate, hashid]
  )
}

export function useLocation(): RR.Location {
  const location = RR.useLocation()
  const hashid = useAccountHashid()
  return useMemo(
    () => (hashid ? { ...location, pathname: stripAccountPath(location.pathname) } : location),
    [hashid, location]
  )
}
