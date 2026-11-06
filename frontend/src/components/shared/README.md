# Kit compartilhado

A camada de composição das telas. **Tudo sai daqui:** `import { DataTable, TextField } from "@/components/shared"`. Vitrine com todos os estados em `/dev/kit` (`routes/dev/kit.tsx`), que também serve de exemplo completo de uso.

Antes de criar um componente, procure aqui. Se faltar algo genérico, é melhor estender o kit do que fazer uma versão local. Primitivas ficam intactas em `@/components/ui`.

## Regras que valem para o kit inteiro

- **Texto:** nada literal. Todo rótulo que o kit recebe por prop já vem de `t()` da tela; o que o kit escreve sozinho (paginação, "Limpar filtros") está em `locales/*/kit.json`.
- **Cor:** só tokens. Status com `StatusBadge` ou `bg-status-*` e `text-status-*`. Hex só em cor escolhida pela pessoa (`TagChip`, pasta).
- **Toque:** `Button` e os campos do kit já têm alvo de 40 px em tela de toque, por `index.css`. `<button>` cru não tem: use `Button`.
- **Altura em toque:** para um botão visualmente maior, `className="pointer-coarse:h-10"`.
- **Datas:** a API entrega milissegundos. `RelativeTime` e `lib/date-format` aceitam ms, ISO e `Date`. Campos de formulário usam `Date | null`; mande `.getTime()` para a API.
- **Vazio é `null`:** `defaultValues` com **todos** os campos, `null` nos vazios. Campo sem padrão faz `isDirty` nascer `true`, e o aviso de sair sem salvar aparece à toa.

## Qual usar

| Preciso de | Use |
|---|---|
| Registros com várias colunas comparáveis | `DataTable` |
| Lista longa sem colunas (conversas, avisos) | `InfiniteList` |
| Busca e filtros acima de uma coleção | `FilterBar` com `FacetedFilter` |
| Filtro ligado a uma coluna específica | `meta.filter` na coluna |
| Detalhe ou edição sem sair da lista | `SidePanel` |
| Tarefa curta sobre a tela | `ResponsiveDialog` |
| Confirmar ação destrutiva | `useConfirm` |
| Estado do sistema (ativo, falhou) | `StatusBadge` |
| Rótulo com cor da pessoa | `TagChip` |

**Tabela não é o padrão.** Lista densa e cards costumam ser melhores; escolha `DataTable` só quando comparar colunas for o trabalho da tela.

---

## Página

### `PageBody` e `PageHeader`

Toda rota começa assim. `PageBody` dá largura e respiro (`default`, `wide`, `full`) e impede a rolagem dupla na página. O `PageHeader` empilha as ações no celular.

```tsx
<PageBody variant="wide">
  <PageHeader
    title={t("contacts.title")}
    description={t("contacts.description")}
    breadcrumb={[{ label: t("nav.home"), to: "/" }, { label: t("contacts.title") }]}
    actions={<Button onClick={create.onTrue}><Plus />{t("contacts.create")}</Button>}
  />
  {/* conteúdo */}
</PageBody>
```

### `SettingsSection`

Bloco de configurações: explicação à esquerda, controles à direita, empilhado no celular. Seções vizinhas se separam por um fio.

```tsx
<SettingsSection title={t("settings.push.title")} description={t("settings.push.description")}>
  <SwitchField control={form.control} name="push" label={t("settings.push.label")} />
</SettingsSection>
```

### `SectionCard`

Agrupa um assunto quando só o espaçamento não basta. `flush` encosta o conteúdo nas bordas, para listas.

```tsx
<SectionCard title={t("x.title")} description={t("x.hint")} actions={<Button size="sm" />} footer={<FormActions submitLabel={t("x.save")} />}>
  {children}
</SectionCard>
```

---

## Coleções

### `DataTable`

Genérica, com cabeçalho fixo, ordem, filtro por coluna, densidade, paginação, seleção, ações por linha, esqueleto, vazio e erro. No celular vira lista empilhada, sozinha.

**Colunas fora do componente ou em `useMemo`.** Tudo que a tabela precisa saber da coluna fica em `meta`:

```tsx
const columns = useMemo<ColumnDef<Contact, any>[]>(() => [
  {
    accessorKey: "name",
    header: t("contacts.name"),
    meta: { mobile: "primary", filter: { type: "text" } },
    cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
  },
  {
    accessorKey: "stage",
    header: t("contacts.stage"),
    meta: { filter: { type: "select", options: stageOptions } },
    cell: ({ row }) => <StatusBadge tone="info">{t(`stages.${row.original.stage}`)}</StatusBadge>,
  },
  { accessorKey: "value", header: t("contacts.value"), meta: { align: "right" }, cell: ({ row }) => <Money value={row.original.value} /> },
  {
    accessorKey: "lastContact",
    header: t("contacts.lastContact"),
    meta: {
      filter: { type: "dateRange" },
      sortLabels: { desc: t("sort.recent"), asc: t("sort.oldest") }, // no celular, no lugar de "decrescente"
      className: "w-40",
    },
    cell: ({ row }) => <RelativeTime value={row.original.lastContact} />,
  },
], [t, stageOptions])
```

`meta.mobile`: `primary` (título da linha), `secondary` (apoio sem rótulo), `meta` (padrão: rótulo e valor), `hidden`. Texto longo: `className: "whitespace-normal min-w-64"`.

**Tudo no navegador** (lista pequena, já carregada): passe só `data`. A busca entra por `globalFilter`, sem acento e sem caixa.

```tsx
<DataTable
  aria-label={t("contacts.title")}
  columns={columns}
  data={data?.contacts ?? []}
  isLoading={isLoading}
  error={error}
  onRetry={() => mutate()}
  globalFilter={query}
  empty={{ title: t("contacts.empty"), description: t("contacts.emptyHint"), action: { label: t("contacts.create"), onClick: create.onTrue } }}
/>
```

**Com a API paginando:** passe `meta` e `onPageChange`. A partir daí ordem e filtro também são do servidor, e só aparecem se a tela os ligar à consulta. A tabela volta sozinha à página 1 ao mudar ordem, filtro de coluna ou tamanho da página.

```tsx
const [page, setPage] = useState(1)
const [perPage, setPerPage] = useState(25)
const [sorting, setSorting] = useState<{ id: string; desc: boolean }[]>([])
const [filters, setFilters] = useState<{ id: string; value: unknown }[]>([])

const params = new URLSearchParams({ page: String(page), perPage: String(perPage) })
if (sorting[0]) {
  params.set("sort", sorting[0].id)
  params.set("direction", sorting[0].desc ? "desc" : "asc")
}

const { data, error, isLoading, isValidating, mutate } = useApi<{ contacts: Contact[]; meta: PaginationMeta }>(
  `/contacts?${params}`,
  { keepPreviousData: true } // sem isto, a tabela pisca a cada página
)

<DataTable
  columns={columns}
  data={data?.contacts ?? []}
  meta={data?.meta}
  isLoading={isLoading}
  isFetching={isValidating}
  error={error}
  onRetry={() => mutate()}
  onPageChange={setPage}
  onPerPageChange={setPerPage}
  sorting={sorting}
  onSortingChange={setSorting}
  columnFilters={filters}
  onColumnFiltersChange={setFilters}
/>
```

Filtro **de fora** da tabela (`FilterBar`): quem zera a página é a tela, e `isFiltered` faz o vazio virar "sem resultado" com botão de limpar.

**Seleção, lote e linha:**

```tsx
<DataTable
  selectable
  selectAllMatching // oferece "todos os 1.240", além da página. Só com `meta`.
  bulkActions={({ ids, allMatching, clear }) => (
    <Button variant="ghost" size="sm" onClick={async () => { await archive(allMatching ? { filter } : { ids }); clear() }}>
      <Archive />{t("contacts.archive")}
    </Button>
  )}
  rowActions={(contact) => [
    { label: t("contacts.edit"), icon: <Pencil />, onSelect: () => edit(contact) },
    { label: t("contacts.delete"), icon: <Trash2 />, destructive: true, separatorBefore: true, onSelect: () => remove(contact) },
  ]}
  onRowClick={(contact) => setOpen(contact.id)} // clique em botão ou checkbox dentro da linha não dispara
  {...rest}
/>
```

**Não use `FilterBar` com filtros e `meta.filter` na mesma tabela:** no celular apareceriam dois botões "Filtros". `FilterBar` só com a busca, mais `meta.filter`, funciona bem.

### `FilterBar`

A linha acima da coleção: busca, filtros, ordem, limpar e contagem. No celular os filtros vão para uma Sheet, empilhados, sem precisar de nada. A tela guarda o estado e aplica.

```tsx
<FilterBar
  search={{ value: query, onChange: setQuery, placeholder: t("contacts.search") }}
  activeCount={(stages.length ? 1 : 0) + (period ? 1 : 0)}
  onClear={clearAll}
  resultLabel={t("contacts.count", { count: total })}
  sort={<SortMenu value={sort} onChange={setSort} options={sortOptions} />}
  filters={
    <>
      <FacetedFilter title={t("contacts.stage")} options={stageOptions} value={stages} onChange={setStages} />
      <DateRangePicker label={t("contacts.period")} value={period} onChange={setPeriod} className="md:w-52" />
    </>
  }
/>
```

### `SearchInput`

Busca com atraso (`debounce`, 300 ms; 0 para filtro local), limpar, Esc e atalho `/`. Só um na tela com atalho: nos outros, `shortcut={false}`.

```tsx
<SearchInput value={query} onChange={setQuery} loading={isValidating} placeholder={t("chat.search")} />
```

### `FacetedFilter`

Uma ou mais opções de um campo, com contagem. Busca interna a partir de 7 opções, sem acento. Em `FilterBar` no celular e em `FilterPopover`, a lista já aparece direto.

```tsx
<FacetedFilter
  title={t("chat.status")}
  options={[{ value: "open", label: t("chat.open"), count: 128 }]}
  value={status}
  onChange={setStatus}
/>
```

### `FilterPopover`

Vários filtros atrás de um botão com a contagem de ativos, quando a linha não comporta. Vira Sheet no celular.

```tsx
<FilterPopover activeCount={active} onClear={clearAll}>
  <FacetedFilter {...stage} />
  <DateRangePicker label={t("x.period")} value={period} onChange={setPeriod} />
</FilterPopover>
```

Filtro próprio da tela: `useFilterLayout()` diz se ele está em linha ou empilhado num painel.

### `SortMenu`

Ordem de coleção que não é tabela. O rótulo já diz o sentido.

```tsx
<SortMenu value={sort} onChange={setSort} options={[{ value: "recent", label: t("sort.recent") }, { value: "name", label: t("sort.nameAsc") }]} />
```

### `SegmentedControl`

De 2 a 5 visões da mesma coisa. Sempre há um ativo. Ícone sozinho precisa de `aria-label`.

```tsx
<SegmentedControl
  aria-label={t("chat.view")}
  value={view}
  onChange={setView}
  options={[
    { value: "open", label: t("chat.open"), count: 128 },
    { value: "grid", label: <LayoutGrid />, "aria-label": t("chat.grid") },
  ]}
/>
```

### `InfiniteList`

Lista longa virtualizada: só o que está na tela existe no DOM. **Precisa de altura definida no pai** (`h-full` num contêiner com altura) ou de `scrollParent`. Traz esqueleto, vazio, erro, fim de lista e botão para quem navega por teclado.

```tsx
<div className="h-[calc(100dvh-8rem)]">
  <InfiniteList
    aria-label={t("chat.list")}
    items={chats}
    getItemKey={(chat) => chat.id}
    renderItem={(chat) => <ChatRow chat={chat} />}
    hasMore={hasMore}
    loading={isLoading}
    loadingMore={isLoadingMore}
    onLoadMore={() => setSize(size + 1)}
    error={error}
    onRetry={() => mutate()}
    empty={{ title: t("chat.empty") }}
  />
</div>
```

**Conversa:** `reverse`. Começa no fim, as antigas entram no topo sem a tela pular (itens novos na frente do array), e mensagem nova só rola quem já estava no fim.

```tsx
<InfiniteList reverse items={messages} getItemKey={(m) => m.id} renderItem={(m) => <Bubble message={m} />} hasMore={hasOlder} onLoadMore={loadOlder} />
```

### `BulkActionsBar`

Ações sobre os selecionados, flutuando embaixo. O `DataTable` já traz esta barra: use sozinha só em listas e grades. Fica acima da navegação do celular pela variável `--mobile-nav-height`.

```tsx
<BulkActionsBar count={selected.length} onClear={clear}>
  <Button variant="ghost" size="sm" onClick={archive}><Archive />{t("x.archive")}</Button>
</BulkActionsBar>
```

### `ActionsMenu` e `TablePagination`

O menu "..." de um registro, para cards e listas (`DataTable` já usa). E o rodapé paginado, para listas e grades fora da tabela.

```tsx
<ActionsMenu label={t("x.actionsOf", { name })} actions={[{ label: t("x.edit"), onSelect: edit }]} />
<TablePagination page={meta.page} totalPages={meta.totalPages} total={meta.total} perPage={meta.perPage} onPageChange={setPage} />
```

---

## Dados

### `StatTile` e `Sparkline`

Um número e o que ele significa. `value` numérico formata sozinho e compacta a partir de 10 mil. A variação é uma razão (`0.125` = +12,5%) e só ela tem cor, sempre com seta e sinal. `goodWhen: "down"` para o que melhora caindo.

```tsx
<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
  <StatTile label={t("d.open")} value={128} delta={{ value: 0.125, label: t("d.vsLastWeek") }} sparkline={series} />
  <StatTile label={t("d.revenue")} value={<Money value={48250.9} compact />} />
  <StatTile label={t("d.wait")} value={t("d.minutes", { value: 4 })} delta={{ value: -0.18, goodWhen: "down" }} />
  <StatTile label={t("d.loading")} value={0} loading />
</div>
```

### `StatusBadge`

Estado de um registro. Tons `neutral`, `success`, `warning`, `danger`, `info`, `accent`. Sempre com texto.

```tsx
<StatusBadge tone="success">{t("connector.connected")}</StatusBadge>
<StatusBadge tone="danger" icon={<AlertTriangle />}>{t("connector.failed")}</StatusBadge>
```

### `TagChip`

Etiqueta com a cor que a pessoa escolheu. O contraste do texto é calculado: amarelo puro continua legível. Sem `color`, sai neutra.

```tsx
<TagChip color={tag.color} onRemove={() => remove(tag)} removeLabel={t("tags.remove", { name: tag.name })}>{tag.name}</TagChip>
<TagChip color={tag.color} variant="solid">{tag.name}</TagChip>
```

### `UserAvatar` e `AvatarStack`

Foto ou iniciais sobre fundo neutro. O nome é o que o leitor de tela anuncia. A pilha mostra até `max` rostos e o "+N".

```tsx
<UserAvatar name={contact.name} src={contact.avatarUrl} size="sm" status="online" />
<AvatarStack users={members} max={4} />
```

### `RelativeTime`

"há 3 horas", que se atualiza sozinho, com a data completa no tooltip. Entende futuro ("em 2 dias"). Vazio mostra o traço.

```tsx
<RelativeTime value={message.createdAt} className="text-xs text-muted-foreground" />
```

### `Money`

Moeda e separadores do idioma ativo, em algarismos alinhados. `value` em reais (aceita a string da API), ou `cents` em centavos.

```tsx
<Money value={deal.value} />
<Money cents={plan.priceCents} />
<Money value={total} compact />
```

### `CopyButton`

Copia e confirma ali mesmo. Sem `label`, é só o ícone.

```tsx
<CopyButton value={inviteLink} />
<CopyButton value={inviteLink} label={t("invite.copy")} variant="outline" size="sm" />
```

### `KeyValueList`

Detalhes de um registro. Valor vazio mostra o traço; `copyValue` adiciona o botão de copiar.

```tsx
<KeyValueList items={[
  { label: t("c.phone"), value: formatPhone(contact.phone), copyValue: contact.phone },
  { label: t("c.company"), value: contact.company },
]} />
```

### `Timeline`

Histórico em ordem: atividades, passos de um envio. O marcador usa os tons de status.

```tsx
<Timeline items={[
  { id: "1", tone: "danger", title: t("e.failed"), description: t("e.failedHint"), time: event.at },
  { id: "2", icon: <UserPlus />, title: t("e.assigned"), time: event.at, content: <TagChip>{name}</TagChip> },
]} />
```

### `FileTypeIcon`

Ícone do tipo de arquivo, por MIME ou extensão.

```tsx
<FileTypeIcon mediaType={file.type} fileName={file.name} className="size-4" />
```

---

## Sobreposições

### `SidePanel`

Detalhe ou edição sem sair da lista. **É a escolha padrão no lugar de um modal grande.** Corpo rolável, cabeçalho e rodapé fixos, largura toda no celular. `size`: `md`, `lg`, `xl`. Com dedo, abrir não sobe o teclado.

```tsx
<SidePanel
  open={open}
  onOpenChange={setOpen}
  title={contact.name}
  description={contact.company}
  headerActions={<CopyButton value={contact.phone} />}
  footer={<Button variant="outline" onClick={() => setOpen(false)}>{t("x.close")}</Button>}
>
  <KeyValueList items={items} />
</SidePanel>
```

### `ResponsiveDialog`

Tarefa curta sobre a tela: Dialog no desktop, Sheet que sobe de baixo no celular. `size`: `sm`, `md`, `lg`, `xl`.

```tsx
<ResponsiveDialog
  trigger={<Button>{t("tags.rename")}</Button>}
  title={t("tags.renameTitle")}
  description={t("tags.renameHint")}
>
  {children}
</ResponsiveDialog>
```

### `useConfirm` e `ConfirmDialog`

Toda ação destrutiva confirma. `useConfirm` é o caminho curto: nada a montar, funciona sobre painéis e fora de componente (`confirm`). Em `onConfirm`, o diálogo espera, mostra "carregando" e, se rejeitar, fica aberto com a mensagem do erro. Em destrutivo, o foco nasce em Cancelar.

```tsx
const confirm = useConfirm()

async function remove(contact: Contact) {
  const confirmed = await confirm({
    title: t("contacts.deleteTitle"),
    description: t("contacts.deleteHint"),
    confirmLabel: t("contacts.delete"), // verbo, nunca "OK"
    destructive: true,
    onConfirm: () => apiDelete(`/contacts/${contact.id}`),
  })
  if (confirmed) toast.success(t("contacts.deleted"))
}
```

`requireText: "EXCLUIR"` exige digitar, para o que não tem volta. `ConfirmDialog` é a forma declarativa, com `open` e `onOpenChange`, para a tela que já controla o estado.

### `ResponsivePopover`

Painel preso a um botão no desktop, Sheet inferior no celular. Base de datas e filtros, para o que for próprio da tela.

```tsx
<ResponsivePopover title={t("x.title")} trigger={<Button>{t("x.open")}</Button>} className="w-80">
  {children}
</ResponsivePopover>
```

### `UnsavedChangesDialog`

Pergunta antes de sair de um formulário com alteração: rota, botão voltar e fechar a aba. Trocar só a query não conta. Basta colocar na tela. Para outra apresentação, `useUnsavedChanges` de `@/hooks/use-unsaved-changes`.

```tsx
<UnsavedChangesDialog when={form.formState.isDirty} />
```

---

## Formulários

Todos sobre react-hook-form e zod, com rótulo, erro, dica e ARIA já ligados. Sempre passe `control`: é o que faz o TypeScript checar `name`.

**Mensagens do zod vêm do i18n, então o schema nasce dentro do render:**

```tsx
function buildSchema(t: (key: string) => string) {
  return z.object({
    name: z.string().min(1, t("contacts.nameRequired")),
    phone: z.string().refine(isValidPhone, t("contacts.phoneInvalid")),
    stage: z.string().nullable().refine(Boolean, t("contacts.stageRequired")),
  })
}

const schema = useMemo(() => buildSchema(t), [t])
const form = useForm<z.infer<typeof schema>>({
  resolver: zodResolver(schema),
  defaultValues: { name: "", phone: "", stage: null }, // todos os campos, `null` nos vazios
  mode: "onBlur",
})
```

### `Form`, `useFormSubmit` e `FormActions`

**Sem `try/catch`:** a validação, o segundo clique ignorado e o erro do servidor são automáticos. Se `onSubmit` rejeitar com `ApiError`, cada campo de `details` recebe a sua mensagem, o foco vai para o primeiro, e o que não tem campo na tela vira erro geral acima dos botões.

Em página, `Form`:

```tsx
<Form form={form} className="flex flex-col gap-5" onSubmit={async (values) => {
  await apiPost("/contacts", { contact: values })
  toast.success(t("contacts.created"))
}}>
  <TextField control={form.control} name="name" label={t("contacts.name")} autoFocus />
  <FormActions submitLabel={t("contacts.create")} onCancel={close} />
</Form>
```

Em `SidePanel` e `ResponsiveDialog`, `useFormSubmit`, passando `form` ao `FormActions`, porque o conteúdo vai para um portal:

```tsx
const submit = useFormSubmit(form, async (values) => {
  await apiPatch(`/contacts/${id}`, { contact: values })
  toast.success(t("contacts.saved"))
  close()
})

<SidePanel open={open} onOpenChange={setOpen} title={t("contacts.edit")} onSubmit={submit}
  footer={<FormActions form={form} submitLabel={t("contacts.save")} onCancel={close} requireChanges />}
>
  <TextField control={form.control} name="name" label={t("contacts.name")} />
</SidePanel>
```

`requireChanges` só libera o botão depois de alguma alteração. Fora do react-hook-form, `<FormActions loading={busy} … />`. `FormError` mostra o erro geral em outro lugar.

### `applyServerErrors`

Só para enviar por fora de `Form` e `useFormSubmit`. Devolve `true` se algum campo foi marcado.

```tsx
try { await save(values) } catch (error) { applyServerErrors(error, form.setError, { fields: ["name", "email"] }) }
```

### `FormField`

Liga um controle próprio da tela ao formulário. `controlProps` leva `id` e ARIA. Os campos prontos abaixo são feitos com ele.

```tsx
<FormField control={form.control} name="body" label={t("x.body")} optional hint={t("x.hint")}>
  {({ field, controlProps }) => <RichEditor {...controlProps} value={field.value} onChange={field.onChange} />}
</FormField>
```

Todos os campos aceitam `control`, `name`, `label`, `hint`, `action`, `optional`, `disabled` e `className`. Marque `optional` na exceção, em vez de encher de asterisco.

### Campos prontos

```tsx
<TextField control={c} name="email" type="email" label={l} autoComplete="email" />
<TextField control={c} name="site" label={l} startAdornment="https://" />
<TextField control={c} name="password" type="password" label={l} /> {/* já com mostrar e esconder */}
<TextareaField control={c} name="notes" label={l} showCount maxLength={280} />

<SelectField control={c} name="stage" label={l} options={options} clearLabel={t("x.none")} /> {/* poucas opções */}
<ComboboxField control={c} name="city" label={l} options={cities} clearable /> {/* muitas: digita e filtra, sem acento */}
<ComboboxField control={c} name="ownerId" label={l} loadOptions={searchOwners} selectedOption={current} /> {/* busca na API */}
<MultiSelectField control={c} name="tags" label={l} options={tags} /> {/* valor: string[] */}

<SwitchField control={c} name="push" label={l} hint={h} /> {/* liga e desliga */}
<CheckboxField control={c} name="terms" label={l} /> {/* aceite, opção ao enviar */}
<RadioField control={c} name="channel" label={l} options={options} variant="cards" orientation="horizontal" /> {/* até umas 5 */}

<DateField control={c} name="birthday" label={l} clearable min={min} max={max} /> {/* Date | null */}
<DateTimeField control={c} name="at" label={l} defaultTime="14:00" /> {/* Date | null */}
<DateRangeField control={c} name="period" label={l} /> {/* { from, to } | null */}

<ColorField control={c} name="color" label={l} /> {/* hex, com amostras */}
<PhoneField control={c} name="phone" label={l} /> {/* dígitos com o país: "5531983794137" */}
<NumberField control={c} name="seats" label={l} steppers min={1} max={50} /> {/* number | null */}
<NumberField control={c} name="discount" label={l} step={0.05} format={{ style: "percent" }} />
<CurrencyField control={c} name="price" label={l} /> {/* number em reais | null; dígitos entram pela direita */}
```

A busca assíncrona recebe o `signal`, para cancelar a anterior:

```tsx
const searchOwners: LoadOptions = async (query, signal) => {
  const { accounts } = await apiGet<{ accounts: Account[] }>(`/accounts?q=${encodeURIComponent(query)}`, { signal })
  return accounts.map((account) => ({ value: account.id, label: account.name, description: account.email }))
}
```

Fora de formulário (filtros, edição em linha), as mesmas peças sem react-hook-form: `SelectInput`, `SearchableSelect`, `MultiSelectInput`, `DatePicker`, `DateTimePicker`, `DateRangePicker`, `ColorPicker`, `PhoneInput`, `NumberInput`, `CurrencyInput`. Recebem `value` e `onChange`.

### `DateRangePicker`

Período com atalhos, que aplicam na hora. No calendário a pessoa marca início e fim e confirma. `to` já vem no fim do dia, pronto para filtrar. `presets` troca os atalhos.

```tsx
<DateRangePicker label={t("x.period")} value={period} onChange={setPeriod} />
```

### `FileDropzone`

Arrastar, clicar ou tocar. Explica tipo, tamanho e quantidade antes de dar erro. Prévia de imagem, progresso, cancelar e tentar de novo. Com `maxFiles={1}`, o novo substitui o atual.

```tsx
<FileDropzone
  value={files}
  onChange={setFiles}
  accept={{ "image/*": [], "application/pdf": [".pdf"] }}
  maxSize={5 * 1024 * 1024}
  maxFiles={3}
  upload={{ path: "/attachments", fieldName: "file", onSuccess: (response) => attach(response) }}
/>
```

Sem `upload`, os arquivos só ficam na lista, para ir junto com o formulário. Para URL pré-assinada, `upload={{ send: (file, { onProgress, signal }) => … }}`. Em formulário, dentro de `FormField`.

---

## Esqueletos

Carregando é esqueleto que espelha o layout, nunca spinner solto. Todos anunciam "carregando" uma vez ao leitor de tela.

```tsx
<ListSkeleton rows={6} avatar />
<TableSkeleton rows={8} columns={4} />
<CardGridSkeleton cards={6} media />
<DetailSkeleton rows={5} /> {/* em SidePanel */}
<PageSkeleton variant="wide" /> {/* fallback de rota lazy */}
```

`DataTable` e `InfiniteList` já trazem o próprio esqueleto.

## Estados

`EmptyState` e `ErrorState` também saem daqui. Vazio orienta e oferece a próxima ação; erro de leitura é tela com tentar de novo, nunca só um toast.

```tsx
<EmptyState title={t("x.empty")} description={t("x.emptyHint")} action={{ label: t("x.create"), onClick: create }} />
<ErrorState error={error} onRetry={() => mutate()} />
```

---

## Movimento: `@/lib/motion`

**Sempre `useMotionPreset()`**, que troca o deslocamento por um fade curto para quem pediu menos movimento. `AnimatePresence` para entrar e sair. Só `transform` e `opacity`.

```tsx
const preset = useMotionPreset()

<AnimatePresence>
  {open ? <motion.div {...preset.slideUp}>{children}</motion.div> : null}
</AnimatePresence>

<motion.ul {...preset.stagger}>
  {items.map((item) => <motion.li key={item.id} variants={preset.staggerItem}>{item.name}</motion.li>)}
</motion.ul>
```

Presets: `fade`, `slideUp`, `listItem`, `stagger` com `staggerItem`. Transições: `spring`, `springSoft`. As animações em CSS das primitivas já respeitam a preferência, por `index.css`.

## Hooks: `@/hooks/*`

| Hook | Para quê |
|---|---|
| `useBoolean(false)` | `{ value, onTrue, onFalse, onToggle, setValue }` para diálogos e painéis |
| `useDebouncedValue(value, 300)` | Valor com atraso, para busca na API |
| `useDebouncedCallback(fn, 300)` | Função com atraso, com `.cancel()` e `.flush()` |
| `useLocalStorage(key, padrão)` | `[valor, set, remove]` em JSON. Sincroniza entre componentes e abas; não quebra sem storage |
| `useMediaQuery(query)` | Reage a uma media query |
| `useIsMobile()` | Abaixo do `md`: decisões de **layout** |
| `useIsTouch()` | Dedo: decisões de **interação** (hover, área de toque). Um iPad Pro é largo e de toque |
| `useLongPress(fn, { delay })` | `{ handlers, didFire }`: pressionar e segurar. Espalhe `handlers` e cheque `didFire()` no clique |
| `useUnsavedChanges(when)` | `{ blocked, proceed, reset }`, sob `BrowserRouter` e data router |
| `usePageTitle(title)` | Título da aba: "Contatos · Vekoo" |

## Utilitários: `@/lib/*`

Datas e números sempre por `Intl`, com `useLanguage()`.

| Módulo | Principais |
|---|---|
| `date-format` | `formatDate`, `formatTime`, `formatDateTime`, `formatFullDateTime`, `formatDateInterval`, `formatDateRange` (título da agenda), `startOfDay`, `endOfDay`, `toDateInputValue` |
| `format-number` | `formatNumber`, `formatCompactNumber`, `formatPercent`, `formatCurrency` |
| `format-phone` | `formatPhone` ("55 31 98379-4137"), `formatBrazilianPhone` ("(31) 98379-4137"), `isValidPhone`, `onlyDigits` |
| `tag-color` | `getTagStyle`, `getTagTextColor`, `getReadableTextColor`, `contrastRatio`, `isHexColor`, `COLOR_SWATCHES` |
| `file-utils` | `formatFileSize`, `formatDuration`, `getFileKind`, `getMediaKind`, `getFileExtension`, `downloadFile`, `toBytes` |
| `search-text` | `matchesSearch`, `normalizeSearchText`: "joao" acha "João" |
| `safe-local-storage` | `safeLocalStorage`, `createSafeJSONStorage` para o `persist` do zustand |
| `api` | `apiGet`, `apiPost`, `apiPut`, `apiPatch`, `apiDelete`, `apiUpload(path, formData, { onProgress, signal })`, `ApiError`, `PaginationMeta` |

`ApiError.code` inclui `forbidden` e `tooManyRequests`, além de `network`, `notFound`, `unprocessable` e os de autenticação.
