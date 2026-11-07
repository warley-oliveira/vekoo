import { useTranslation } from "react-i18next"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

/** O cabeçalho enquanto a conversa não chega. A seta já funciona: ninguém fica preso esperando. */
export function MobileThreadHeaderSkeleton({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()

  return (
    <div className="shrink-0 border-b pt-safe">
      <div className="flex h-14 items-center gap-1 pr-3 pl-1 landscape:h-11">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11 shrink-0 [&_svg]:size-5"
          aria-label={t("chat.header.back")}
          onClick={onBack}
        >
          <ArrowLeft />
        </Button>
        <Skeleton className="size-9 shrink-0 rounded-full" />
        <div className="flex min-w-0 flex-col gap-1.5 pl-1.5">
          <Skeleton className="h-3.5 w-36" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
    </div>
  )
}
