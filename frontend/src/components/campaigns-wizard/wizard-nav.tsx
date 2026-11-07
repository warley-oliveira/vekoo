/** O título e a explicação de um passo. O título da tela continua na barra superior. */
export function StepHeading({ id, title, hint }: { id: string; title: string; hint: string }) {
  return (
    <header className="flex flex-col gap-1">
      <h2 id={id} tabIndex={-1} className="font-heading text-xl font-medium outline-none md:text-2xl">
        {title}
      </h2>
      <p className="max-w-prose text-sm text-pretty text-muted-foreground">{hint}</p>
    </header>
  )
}
