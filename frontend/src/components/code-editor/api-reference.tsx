import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Search } from "lucide-react"

import { normalizeSearchText } from "@/lib/search-text"

// A referência da API JS, ao lado do código: para quem não decorou o que existe. Clicar insere o exemplo no
// cursor. As assinaturas são contrato do motor (docs/migration/api/script-engine.md) e não se traduzem; a
// explicação de cada grupo vem do i18n.

type Entry = { signature: string; insert?: string }

const GROUPS: { id: string; entries: Entry[] }[] = [
  {
    id: "params",
    entries: [{ signature: "params.nome", insert: "params." }, { signature: "credentials.chave", insert: "credentials." }],
  },
  {
    id: "network",
    entries: [
      { signature: "await fetch(url, { method, headers, body })", insert: "const res = await fetch('https://', { method: 'GET' });\nconst data = await res.json();\n" },
      { signature: "request(url, { method, headers, body })", insert: "const res = request('https://');\n" },
      { signature: "downloadFile(url, { fileName })", insert: "const file = downloadFile('https://', { fileName: 'arquivo.pdf' });\n" },
    ],
  },
  {
    id: "contact",
    entries: [
      { signature: "getContactInfo()", insert: "const contato = getContactInfo();\n" },
      { signature: "contactAttribute.getItem(chave)", insert: "contactAttribute.getItem('chave')" },
      { signature: "contactAttribute.setItem(chave, valor)", insert: "contactAttribute.setItem('chave', 'valor');\n" },
      { signature: "contactStorage.getItem(chave)", insert: "contactStorage.getItem('chave')" },
      { signature: "contactStorage.setItem(chave, valor)", insert: "contactStorage.setItem('chave', 'valor');\n" },
      { signature: "enableAutomation()", insert: "enableAutomation();\n" },
      { signature: "disableAutomation()", insert: "disableAutomation();\n" },
    ],
  },
  {
    id: "tags",
    entries: [
      { signature: "tag.add(nome)", insert: "tag.add('nome');\n" },
      { signature: "tag.remove(nome)", insert: "tag.remove('nome');\n" },
      { signature: "tag.list()", insert: "tag.list()" },
      { signature: "tag.userHasTag(nome)", insert: "tag.userHasTag('nome')" },
      { signature: "assignedUser()", insert: "assignedUser()" },
      { signature: "userList()", insert: "userList()" },
      { signature: "assignUserByEmail(email)", insert: "assignUserByEmail('pessoa@exemplo.com.br');\n" },
      { signature: "assignDepartmentByName(nome)", insert: "assignDepartmentByName('Vendas');\n" },
    ],
  },
  {
    id: "collection",
    entries: [
      { signature: "collection.Create(tabela, dados)", insert: "collection.Create('tabela', { campo: 'valor' });\n" },
      { signature: "collection.Where(tabela, filtro)", insert: "collection.Where('tabela', { campo: 'valor' })" },
      { signature: "collection.FindById(tabela, id)", insert: "collection.FindById('tabela', id)" },
      { signature: "collection.FindOne(tabela, filtro)", insert: "collection.FindOne('tabela', {})" },
      { signature: "collection.Update(tabela, id, dados)", insert: "collection.Update('tabela', id, { campo: 'valor' });\n" },
      { signature: "collection.Delete(tabela, id)", insert: "collection.Delete('tabela', id);\n" },
      { signature: "collection.Paginate(tabela, filtro, opcoes)", insert: "collection.Paginate('tabela', {}, { limit: 20, skip: 0 })" },
      { signature: "collection.Search(tabela, texto, campos)", insert: "collection.Search('tabela', 'texto', ['campo'])" },
      { signature: "collection.Upsert(tabela, filtro, dados)", insert: "collection.Upsert('tabela', { campo: 'valor' }, {});\n" },
      { signature: "collection.Increment(tabela, id, campo, valor)", insert: "collection.Increment('tabela', id, 'campo', 1);\n" },
      { signature: "collection.Aggregate(tabela, campo, 'sum')", insert: "collection.Aggregate('tabela', 'campo', 'sum')" },
    ],
  },
  {
    id: "catalog",
    entries: [
      { signature: "catalog.Search(busca, opcoes)", insert: "catalog.Search('caneca', { limit: 3 })" },
      { signature: "catalog.Get(idOuSku)", insert: "catalog.Get('SKU')" },
      { signature: "catalog.Categories()", insert: "catalog.Categories()" },
      { signature: "catalog.Facets(campo)", insert: "catalog.Facets('tags')" },
      { signature: "catalog.Similar(idOuSku, limite)", insert: "catalog.Similar('SKU', 5)" },
    ],
  },
  {
    id: "kanban",
    entries: [
      { signature: "kanban.listBoards()", insert: "kanban.listBoards()" },
      { signature: "kanban.findCardsForConversation()", insert: "kanban.findCardsForConversation()" },
      { signature: "kanban.createCard(quadro, coluna, dados)", insert: "kanban.createCard(boardId, columnId, { title: 'Novo' });\n" },
      { signature: "kanban.moveCard(card, coluna)", insert: "kanban.moveCard(cardId, columnId);\n" },
      { signature: "kanban.addComment(card, texto)", insert: "kanban.addComment(cardId, 'texto');\n" },
    ],
  },
  {
    id: "agenda",
    entries: [
      { signature: "appointment.services()", insert: "appointment.services()" },
      { signature: "appointment.employees()", insert: "appointment.employees()" },
      { signature: "appointment.serviceAvailableSlots(serviço, início, fim)", insert: "appointment.serviceAvailableSlots('Serviço', inicio, fim)" },
      { signature: "appointment.create(profissional, serviço, início)", insert: "appointment.create('Profissional', 'Serviço', inicio);\n" },
      { signature: "appointment.cancel(id)", insert: "appointment.cancel(id);\n" },
      { signature: "classGroup.list()", insert: "classGroup.list()" },
      { signature: "classGroup.enroll(turma, dia, início)", insert: "classGroup.enroll('Turma', 1, '08:00');\n" },
    ],
  },
  {
    id: "utilities",
    entries: [
      { signature: "console.log(...)", insert: "console.log();\n" },
      { signature: "sleep(ms)", insert: "sleep(1000);\n" },
      { signature: "maps.routes(origem, destino, opcoes)", insert: "maps.routes('origem', 'destino', { travelMode: 'DRIVE' })" },
      { signature: "crypto.randomUUID()", insert: "crypto.randomUUID()" },
      { signature: "crypto.createHash('sha256')", insert: "crypto.createHash('sha256').update(texto).digest('hex')" },
      { signature: "crypto.createHmac('sha256', chave)", insert: "crypto.createHmac('sha256', chave).update(texto).digest('hex')" },
      { signature: "btoa(texto) / atob(base64)", insert: "btoa(texto)" },
    ],
  },
]

export function ApiReference({ onInsert }: { onInsert: (text: string) => void }) {
  const { t } = useTranslation()
  const [query, setQuery] = useState("")
  const needle = normalizeSearchText(query)

  const groups = useMemo(() => {
    if (!needle) return GROUPS
    return GROUPS.map((group) => ({
      ...group,
      entries: group.entries.filter((entry) => normalizeSearchText(entry.signature).includes(needle)),
    })).filter((group) => group.entries.length > 0)
  }, [needle])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1.5 border-b px-2.5">
        <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("flows.codeEditor.referenceSearch")}
          aria-label={t("flows.codeEditor.referenceSearch")}
          className="h-9 min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {groups.map((group) => (
          <section key={group.id} className="pb-2">
            <h4 className="px-1.5 pt-1.5 text-xs font-medium">{t(`flows.codeEditor.reference.${group.id}.title`)}</h4>
            <p className="px-1.5 pb-1 text-[11px] leading-snug text-pretty text-muted-foreground">
              {t(`flows.codeEditor.reference.${group.id}.hint`)}
            </p>
            <ul>
              {group.entries.map((entry) => (
                <li key={entry.signature}>
                  <button
                    type="button"
                    title={t("flows.codeEditor.insert")}
                    onClick={() => onInsert(entry.insert ?? entry.signature)}
                    className="w-full truncate rounded-md px-1.5 py-1 text-left font-mono text-[11px] text-foreground/80 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    {entry.signature}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
