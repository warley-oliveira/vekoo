import { create } from "zustand"

import type { FlowIssue } from "@/lib/flows/validate"
import type { FlowVersion } from "@/lib/flows/types"

// O que é só da tela do editor (painéis abertos, estado do salvamento), e não do fluxo: não entra no
// histórico nem na definição. Um store só, porque só há um editor aberto de cada vez; `reset` limpa ao sair.

export type EditorDialog = "publish" | "details" | "fields" | "basePrompt" | "versions" | "start" | null

export type SaveStatus = "saved" | "dirty" | "saving" | "error" | "conflict"

type EditorUiState = {
  /** Painel à direita, no lugar do inspetor. */
  testOpen: boolean
  outlineOpen: boolean
  dialog: EditorDialog
  /** Código aberto de um bloco "Executar função": o id da função, ou `null` para uma nova. */
  codeTool: { id: string | null; nodeId: string } | null
  /** O centro do que está na tela, em coordenadas do quadro: é onde nasce um bloco da barra. */
  canvasCenter: (() => { x: number; y: number }) | null

  saveStatus: SaveStatus
  /** Grava agora o que estiver pendente. `false` se não conseguiu. */
  flush: () => Promise<boolean>
  /** Publicar abre um rascunho novo: quem salva precisa saber, para não achar que foi outra pessoa. */
  acceptDraft: (draft: FlowVersion | null) => void
  /** A conferência de publicar, atualizada a cada pausa da edição. */
  issues: FlowIssue[]
  /** Há algo no rascunho que a versão publicada ainda não tem. */
  unpublished: boolean
  /** Uma execução do histórico acesa no quadro. */
  replay: { label: string } | null

  setTestOpen: (open: boolean) => void
  toggleOutline: () => void
  setOutlineOpen: (open: boolean) => void
  setDialog: (dialog: EditorDialog) => void
  setCodeTool: (tool: EditorUiState["codeTool"]) => void
  reset: () => void
}

const INITIAL = {
  testOpen: false,
  outlineOpen: false,
  dialog: null,
  codeTool: null,
  canvasCenter: null,
  saveStatus: "saved" as SaveStatus,
  flush: async () => true,
  acceptDraft: () => {},
  issues: [],
  unpublished: false,
  replay: null,
}

export const useEditorUi = create<EditorUiState>()((set) => ({
  ...INITIAL,
  setTestOpen: (testOpen) => set({ testOpen }),
  toggleOutline: () => set((state) => ({ outlineOpen: !state.outlineOpen })),
  setOutlineOpen: (outlineOpen) => set({ outlineOpen }),
  setDialog: (dialog) => set({ dialog }),
  setCodeTool: (codeTool) => set({ codeTool }),
  reset: () => set(INITIAL),
}))
