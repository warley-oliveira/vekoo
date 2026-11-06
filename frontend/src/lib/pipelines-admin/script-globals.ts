// O que o editor conhece do script de um gatilho: autocompletar e checagem de tipos. Só assinaturas,
// sem texto: a explicação fica na referência ao lado, traduzida. Os nomes `kanban.*`, `column` e
// `conversation` são contrato de quem já escreve script, de propósito (docs/migration/api/pipelines.md).
export const SCRIPT_GLOBALS = `
interface KanbanLabel { id: string; name: string; color: string }
interface KanbanResult<T = Record<string, any>> { ok: boolean; data?: T; error?: string; pending_items?: string[]; pending_fields?: string[] }

interface KanbanCardData {
  id: string; title: string; description: string | null; status: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent' | null; due_date: string | null; position: number;
  kanban_column_id: string; assigned_to_id: string | null; conversation_id: string | null; tags: string[];
  color_label: string | null; custom_field_values: Record<string, any>; archived: boolean;
  completed_at: string | null; deal_value: number | null; deal_probability: number | null;
  company_name: string | null; contact_email: string | null; contact_phone: string | null;
  won_at: string | null; lost_at: string | null; lost_reason: string | null; labels: KanbanLabel[];
}
interface KanbanCustomField {
  id: string; key: string; name: string; field_type: 'text' | 'number' | 'date' | 'select' | 'checkbox' | 'url' | 'user';
  position: number; required: boolean; options: string[] | null; default_value: any;
}
interface KanbanComment { id: string; body: string; pinned: boolean; created_at: string; edited_at: string | null }
interface KanbanCardFilters {
  allConversations?: boolean; column_id?: string; priority?: 'low' | 'medium' | 'high' | 'urgent';
  assigned_to_id?: string; tags?: string[]; search?: string; overdue?: boolean; archived?: boolean;
}
interface KanbanCardAttrs {
  title?: string; description?: string; priority?: 'low' | 'medium' | 'high' | 'urgent'; due_date?: string | null;
  deal_value?: number | null; deal_probability?: number | null; company_name?: string | null;
  contact_email?: string | null; contact_phone?: string | null; expected_close_date?: string | null;
  tags?: string[]; custom_field_values?: Record<string, any>; color_label?: string; assigned_to_id?: string;
  linkConversation?: boolean;
}
interface KanbanChecklistItem { id: string; title: string; completed: boolean; position: number; toggle(): KanbanChecklistItem | null }
interface KanbanChecklist { id: string; name: string; position: number; items: KanbanChecklistItem[]; addItem(title: string): KanbanChecklistItem | null }

interface KanbanCard extends KanbanCardData {
  update(attrs: KanbanCardAttrs): KanbanCard | null;
  moveTo(ref: string, atEnd?: boolean): KanbanCard | KanbanResult;
  archive(): KanbanCard | null;
  unarchive(): KanbanCard | null;
  markWon(): KanbanCard | null;
  markLost(reason?: string): KanbanCard | null;
  reopen(): KanbanCard | null;
  addLabel(ref: string): KanbanLabel | null;
  removeLabel(id: string): KanbanResult;
  setCustomField(key: string, value: any): KanbanCard | null;
  getCustomField(key: string): any;
  relevantCustomFields(): KanbanCustomField[];
  incrementCustomField(key: string, delta: number): number;
  getCustomFieldNumber(key: string): number;
  addChecklist(name: string): KanbanChecklist | null;
  checklists(): KanbanChecklist[];
  addComment(text: string): KanbanComment | null;
  comments(limit?: number): KanbanComment[];
  refresh(): KanbanCard | null;
}
interface KanbanColumn {
  id: string; name: string; position: number; color: string | null; wip_limit: number | null; sla_hours: number | null;
  cards(filters?: KanbanCardFilters): KanbanCard[];
  createCard(attrs?: KanbanCardAttrs): KanbanCard | null;
}
interface KanbanBoard {
  id: string; name: string; board_type: 'standard' | 'crm'; archived: boolean; description: string | null;
  color: string | null; icon: string | null; columns: KanbanColumn[];
  column(ref: string): KanbanColumn | undefined;
  cards(filters?: KanbanCardFilters): KanbanCard[];
  cardsForConversation(): KanbanCard[];
  createCard(columnRef: string, attrs?: KanbanCardAttrs): KanbanCard | KanbanResult;
  customFields(): KanbanCustomField[];
  refresh(): KanbanBoard | null;
}
interface Kanban {
  boards(): KanbanBoard[];
  board(ref: string): KanbanBoard | null;
  card(id: string): KanbanCard | null;
  cardsForConversation(): KanbanCard[];
  labels(): KanbanLabel[];
  listBoards(): KanbanResult<any[]>;
  getBoard(ref: string): KanbanResult;
  listColumns(boardRef: string): KanbanResult<any[]>;
  listCards(boardRef: string, filters?: KanbanCardFilters): KanbanResult<KanbanCardData[]>;
  findCardsForConversation(): KanbanResult<KanbanCardData[]>;
  listLabels(): KanbanResult<KanbanLabel[]>;
  createCard(boardRef: string, columnRef: string, attrs?: KanbanCardAttrs): KanbanResult<KanbanCardData>;
  getCard(id: string): KanbanResult<KanbanCardData>;
  updateCard(id: string, attrs: KanbanCardAttrs): KanbanResult<KanbanCardData>;
  moveCard(id: string, columnRef: string, atEnd?: boolean): KanbanResult<KanbanCardData>;
  archiveCard(id: string, undo?: boolean): KanbanResult<KanbanCardData>;
  markWon(id: string): KanbanResult<KanbanCardData>;
  markLost(id: string, reason?: string): KanbanResult<KanbanCardData>;
  reopenDeal(id: string): KanbanResult<KanbanCardData>;
  addLabel(id: string, labelRef: string): KanbanResult<KanbanLabel>;
  removeLabel(id: string, labelId: string): KanbanResult;
  setCustomField(id: string, key: string, value: any): KanbanResult<KanbanCardData>;
  getCustomFields(boardRef: string): KanbanResult<KanbanCustomField[]>;
  getCustomField(id: string, key: string): KanbanResult<{ key: string; value: any }>;
  getRelevantCustomFields(id: string): KanbanResult<KanbanCustomField[]>;
  incrementCustomField(id: string, key: string, delta: number): KanbanResult<{ key: string; value: number }>;
  getCustomFieldNumber(id: string, key: string): KanbanResult<{ key: string; value: number }>;
  addChecklist(id: string, name: string): KanbanResult;
  addChecklistItem(checklistId: string, title: string): KanbanResult;
  toggleChecklistItem(itemId: string): KanbanResult;
  listChecklists(id: string): KanbanResult<any[]>;
  addComment(id: string, body: string): KanbanResult<KanbanComment>;
  listComments(id: string, limit?: number): KanbanResult<KanbanComment[]>;
}
declare const kanban: Kanban;

interface TriggerScriptParams {
  card: KanbanCardData;
  board: { id: string; name: string };
  trigger: { id: string; name: string };
  event: { event_type: string; [key: string]: any };
}
declare const params: TriggerScriptParams;
declare const credentials: Record<string, any>;

interface ScriptFetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
  headers?: Record<string, string>;
  body?: string | Record<string, any>;
}
interface ScriptResponse {
  ok: boolean; status: number; url: string; error?: string;
  headers: { get(name: string): string | null; has(name: string): boolean };
  json(): Promise<any>;
  text(): Promise<string>;
}
declare function fetch(url: string, options?: ScriptFetchOptions): Promise<ScriptResponse>;
declare function request(url: string, options?: ScriptFetchOptions): { status: number; ok: boolean; body: any; headers: Record<string, string[]>; url: string; error?: string };
declare function downloadFile(url: string, options?: ScriptFetchOptions & { fileName?: string }): { ok: boolean; id?: string; url?: string; name?: string; fileName?: string; contentType?: string; size?: number; status?: number; error?: string };
declare function sleep(ms: number): void;
declare function btoa(text: string): string;
declare function atob(base64: string): string;
declare function structuredClone<T>(value: T): T;
declare const console: { log(...args: any[]): any[]; warn(...args: any[]): any[]; error(...args: any[]): any[]; info(...args: any[]): void; debug(...args: any[]): void };
declare const crypto: {
  randomUUID(): string;
  randomBytes(size: number): { toString(encoding?: 'hex' | 'base64' | 'utf8'): string };
  getRandomValues(array: Uint8Array): Uint8Array;
  createHash(algorithm: 'md5' | 'sha1' | 'sha256' | 'sha384' | 'sha512'): { update(text: string): any; digest(encoding?: 'hex' | 'base64' | 'base64url' | 'binary'): string };
  createHmac(algorithm: 'md5' | 'sha1' | 'sha256' | 'sha384' | 'sha512', key: string): { update(text: string): any; digest(encoding?: 'hex' | 'base64' | 'base64url' | 'binary'): string };
};

declare function getContactInfo(): { id: string; name: string; external_id: string; phone_number: string };
declare const contactStorage: { getItem(key: string): any; setItem(key: string, value: any): boolean };
declare const contactAttribute: { getItem(key: string): any; setItem(key: string, value: any): boolean };
declare function enableAutomation(): boolean;
declare function disableAutomation(): boolean;
declare const tag: {
  add(name: string): { success: boolean };
  remove(name: string): { success: boolean } | null;
  list(): { name: string; description: string | null; color: string }[];
  listUserTags(): { name: string; description: string | null; color: string }[];
  userHasTag(name: string): boolean;
};
declare function assignedUser(): { id: string; name: string; email: string } | null;
declare function userList(): { id: string; name: string; email: string }[];
declare function assignUserByEmail(email: string | null): boolean;
declare function assignDepartmentByName(name: string): boolean;
declare const collection: {
  Create(table: string, data: Record<string, any>): { ok: boolean; data?: any; error?: string };
  Where(table: string, filter?: Record<string, any>): { ok: boolean; data?: any[]; truncated?: boolean; error?: string };
  FindById(table: string, id: string): { ok: boolean; data?: any; error?: string };
  FindOne(table: string, filter?: Record<string, any>): { ok: boolean; data?: any; error?: string };
  Update(table: string, id: string, data: Record<string, any>): { ok: boolean; data?: any; error?: string };
  Delete(table: string, id: string): { ok: boolean; data?: any; error?: string };
  Count(table: string, filter?: Record<string, any>): { ok: boolean; data?: number; error?: string };
  Upsert(table: string, filter: Record<string, any>, data: Record<string, any>): { ok: boolean; data?: any; error?: string };
  Increment(table: string, id: string, field: string, value?: number): { ok: boolean; data?: any; error?: string };
};
declare const catalog: {
  Search(query: string, options?: Record<string, any>): { ok: boolean; data?: any[]; error?: string };
  Get(idOrSku: string): { ok: boolean; data?: any; error?: string };
  Categories(): { ok: boolean; data?: any[]; error?: string };
};
`
