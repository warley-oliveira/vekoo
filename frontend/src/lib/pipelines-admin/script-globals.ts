// O que o script de um gatilho recebe em `params`. O resto da API (`kanban.*`, `fetch`, `console`...) é o
// mesmo dos fluxos, e quem declara é `components/code-editor/script-definitions.ts`.
export const TRIGGER_PARAMS_DEFINITION = `
interface TriggerScriptParams {
  card: KanbanCardInfo;
  board: { id: string; name: string };
  trigger: { id: string; name: string };
  event: { event_type: string; [key: string]: any };
}
declare const params: TriggerScriptParams;
`
