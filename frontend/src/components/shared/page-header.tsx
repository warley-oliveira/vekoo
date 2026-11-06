import { Fragment, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router"

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
  title: ReactNode
  description?: ReactNode
  /** Botões à direita. No celular descem para baixo do título. */
  actions?: ReactNode
  breadcrumb?: BreadcrumbEntry[]
  className?: string
}

/** Abre toda página: título, apoio e ações. Use um por tela, dentro do `PageBody`. */
export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
  className,
}: PageHeaderProps) {
  const { t } = useTranslation()

  return (
    <header className={cn("flex flex-col gap-3", className)}>
      {breadcrumb?.length ? (
        <Breadcrumb aria-label={t("kit.page.breadcrumb")}>
          <BreadcrumbList>
            {breadcrumb.map((entry, index) => (
              <Fragment key={`${entry.label}-${index}`}>
                {index > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem>
                  {entry.to ? (
                    <BreadcrumbLink render={<Link to={entry.to} />}>
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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0 space-y-1">
          <h1 className="font-heading text-2xl leading-tight font-semibold tracking-tight text-balance">
            {title}
          </h1>
          {description ? (
            <p className="max-w-2xl text-sm text-pretty text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </header>
  )
}
