import { Fragment, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "@/lib/router"

import { useHeaderSlot, usePageTitle, type HeaderSlotPlacement } from "@/hooks/use-header-slot"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { cn } from "@/lib/utils"

export type BreadcrumbEntry = {
  label: string
  /** Sem `to`, o item é a página atual. */
  to?: string
}

export type PageHeaderProps = {
  /**
   * Título da tela, quando for diferente do que a rota declarou (nome do contato, do
   * fluxo). Aparece na barra superior: cada tela tem um título só.
   */
  title?: string
  /** Mostra "voltar" na barra superior, para este caminho. Para subpáginas. */
  backTo?: string
  /** Texto da área de origem, acima do título no celular. */
  parentTitle?: string
  /** Frase de apoio, no topo do conteúdo. Só quando orientar de verdade. */
  description?: ReactNode
  /** Ações da página. Vão para a barra superior, à direita. */
  actions?: ReactNode
  /** Versão própria das ações para o celular. Sem ela, usa `actions`. */
  mobileActions?: ReactNode
  /** Como o celular mostra as ações. O padrão é uma folha com tudo empilhado. */
  mobilePlacement?: HeaderSlotPlacement
  breadcrumb?: BreadcrumbEntry[]
  className?: string
}

/**
 * Abre a tela: leva título e ações para a barra superior e deixa no conteúdo só a
 * descrição e o breadcrumb, quando houver. Use um por tela, dentro do `PageBody`.
 */
export function PageHeader({
  title,
  backTo,
  parentTitle,
  description,
  actions,
  mobileActions,
  mobilePlacement,
  breadcrumb,
  className,
}: PageHeaderProps) {
  const { t } = useTranslation()

  const hasContent = Boolean(breadcrumb?.length || description)

  return (
    <>
      {/* Em componentes à parte: uma tela sem título ou ações próprias não pode apagar o
          que a rota declarou, nem o que outro trecho da página injetou. */}
      {title ? <ShellTitle title={title} backTo={backTo} parentTitle={parentTitle} /> : null}
      {actions ? (
        <ShellActions actions={actions} mobileActions={mobileActions} mobilePlacement={mobilePlacement} />
      ) : null}

      {hasContent ? (
        <header className={cn("flex flex-col gap-3", className)}>
          {breadcrumb?.length ? (
            <Breadcrumb aria-label={t("kit.page.breadcrumb")}>
              <BreadcrumbList>
                {breadcrumb.map((entry, index) => (
                  <Fragment key={`${entry.label}-${index}`}>
                    {index > 0 && <BreadcrumbSeparator />}
                    <BreadcrumbItem>
                      {entry.to ? (
                        <BreadcrumbLink
                          className="relative rounded outline-none focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:after:absolute pointer-coarse:after:-inset-x-1 pointer-coarse:after:-inset-y-2.5"
                          render={<Link to={entry.to} />}
                        >
                          {entry.label}
                        </BreadcrumbLink>
                      ) : (
                        <BreadcrumbPage>{entry.label}</BreadcrumbPage>
                      )}
                    </BreadcrumbItem>
                  </Fragment>
                ))}
              </BreadcrumbList>
            </Breadcrumb>
          ) : null}

          {description ? (
            <p className="max-w-2xl text-sm text-pretty text-muted-foreground">{description}</p>
          ) : null}
        </header>
      ) : null}
    </>
  )
}

function ShellTitle({
  title,
  backTo,
  parentTitle,
}: Pick<PageHeaderProps, "backTo" | "parentTitle"> & { title: string }) {
  usePageTitle(title, { backTo, parentTitle })
  return null
}

function ShellActions({
  actions,
  mobileActions,
  mobilePlacement,
}: Pick<PageHeaderProps, "actions" | "mobileActions" | "mobilePlacement">) {
  useHeaderSlot(actions, { mobileNode: mobileActions, mobilePlacement })
  return null
}
