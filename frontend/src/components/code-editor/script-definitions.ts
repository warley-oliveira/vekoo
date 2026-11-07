/**
 * As definições de tipo do que um script enxerga no motor (docs/migration/api/script-engine.md): é o que
 * dá autocompletar e validação no Monaco. É contrato de quem escreve script: `kanban.*` e `appointment.*`
 * ficam com estes nomes.
 *
 * @param paramsDefinition       interfaces e `declare const params` gerados a
 *                                partir dos parâmetros da função.
 * @param credentialsDefinition  interface e `declare const credentials` gerados
 *                                a partir do schema de credenciais da Tool
 *                                instalada. Quando ausente, emite um Record
 *                                permissivo de strings.
 */
export function scriptDefinitions(
  paramsDefinition: string,
  credentialsDefinition?: string,
): string {
  const credentialsBlock = credentialsDefinition ?? `
/** Credenciais da Tool instalada — schema desconhecido neste contexto. */
interface Credentials { [key: string]: string | undefined }

declare const credentials: Credentials;
`

  return `
${paramsDefinition}

${credentialsBlock}

// ============================================
// Funções de Requisição HTTP
// ============================================

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
}

interface RequestResponse {
  /** Código de status HTTP */
  status: number;
  /** Se a requisição foi bem-sucedida (status 2xx) */
  ok: boolean;
  /** Headers da resposta */
  headers: Record<string, string>;
  /** Corpo da resposta */
  body: any;
}

/**
 * Faz uma requisição HTTP síncrona para a URL especificada.
 * @example request('http://example.com', { method: 'GET', headers: {}, body: JSON.stringify({}) })
 */
declare function request(url: string, options?: RequestOptions): RequestResponse;

// ============================================
// fetch — API Web compatível (async/await)
// ============================================

interface FetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
  /** Normaliza URL removendo caracteres não-ASCII antes do request. */
  handleUrl?: boolean;
  /** Preserva o case dos headers no wire (para servidores que violam RFC 7230). */
  preserveHeaderCase?: boolean;
}

interface FetchResponseHeaders {
  /** Lê um header por nome (case-insensitive). Retorna null se ausente. */
  get(name: string): string | null;
  /** Verifica se um header existe (case-insensitive). */
  has(name: string): boolean;
  /** Lista pares [name, value]. */
  entries(): Array<[string, string]>;
  keys(): string[];
  values(): string[];
}

interface FetchResponse {
  /** true se status no intervalo 200-299. */
  ok: boolean;
  /** Código de status HTTP. */
  status: number;
  statusText: string;
  headers: FetchResponseHeaders;
  url: string;
  /** Retorna o body parseado como JSON. Rejeita se body for string inválida. */
  json<T = any>(): Promise<T>;
  /** Retorna o body como string. */
  text(): Promise<string>;
}

/**
 * Faz uma requisição HTTP usando a API Web Fetch (async/await).
 *
 * Limitações importantes deste ambiente:
 * - A execução é síncrona por baixo dos panos: Promise.all([fetch(a), fetch(b)])
 *   funciona logicamente, mas os requests acontecem em sequência (não há thread JS).
 * - setTimeout, setInterval e SSE/streaming não são suportados.
 *
 * @example
 * const res = await fetch('http://api.example.com/users', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json', Authorization: 'Bearer xyz' },
 *   body: JSON.stringify({ name: 'João' })
 * });
 * if (!res.ok) throw new Error('falhou: ' + res.status);
 * const data = await res.json();
 */
declare function fetch(url: string, options?: FetchOptions): Promise<FetchResponse>;

// ============================================
// Web APIs — atob, btoa, TextEncoder/Decoder, URL, structuredClone
// ============================================

/** Codifica string em base64 (mesmo comportamento do btoa do browser). */
declare function btoa(input: string): string;
/** Decodifica string base64 → string (mesmo comportamento do atob do browser). */
declare function atob(input: string): string;

interface TextEncoder {
  readonly encoding: 'utf-8';
  /** Converte string UTF-8 em Uint8Array de bytes. */
  encode(input?: string): Uint8Array;
}
interface TextEncoderConstructor {
  new (): TextEncoder;
  readonly prototype: TextEncoder;
}
declare const TextEncoder: TextEncoderConstructor;

interface TextDecoder {
  readonly encoding: 'utf-8';
  /** Converte Uint8Array (ou ArrayBuffer) UTF-8 em string. */
  decode(input?: Uint8Array | ArrayBuffer | number[]): string;
}
interface TextDecoderConstructor {
  /** Apenas 'utf-8' é suportado neste ambiente. */
  new (label?: 'utf-8' | 'utf8'): TextDecoder;
  readonly prototype: TextDecoder;
}
declare const TextDecoder: TextDecoderConstructor;

interface URLSearchParamsInstance {
  /** Quantidade total de pares. */
  readonly size: number;
  get(name: string): string | null;
  getAll(name: string): string[];
  has(name: string): boolean;
  set(name: string, value: string): void;
  append(name: string, value: string): void;
  delete(name: string): void;
  entries(): Array<[string, string]>;
  keys(): string[];
  values(): string[];
  forEach(callback: (value: string, name: string, self: URLSearchParamsInstance) => void): void;
  toString(): string;
}
interface URLSearchParamsConstructor {
  new (init?: string | Record<string, any> | Array<[string, string]>): URLSearchParamsInstance;
  readonly prototype: URLSearchParamsInstance;
}
declare const URLSearchParams: URLSearchParamsConstructor;

interface URLInstance {
  href: string;
  readonly origin: string;
  protocol: string;
  username: string;
  password: string;
  host: string;
  hostname: string;
  port: string;
  pathname: string;
  search: string;
  hash: string;
  readonly searchParams: URLSearchParamsInstance;
  toString(): string;
  toJSON(): string;
}
interface URLConstructor {
  /**
   * Parseia URL (opcionalmente resolvendo contra uma base).
   * Lança TypeError se a URL for inválida.
   */
  new (input: string, base?: string): URLInstance;
  readonly prototype: URLInstance;
}
declare const URL: URLConstructor;

/**
 * Faz clone profundo do valor via JSON deep-clone.
 * Limitação: não suporta Date, Map, Set, RegExp, ArrayBuffer ou ciclos —
 * use JSON-serializável apenas. Para esses casos clone manualmente.
 */
declare function structuredClone<T>(value: T): T;

// ============================================
// crypto — hashes, HMAC, UUID, random bytes
// ============================================

type CryptoEncoding = 'hex' | 'base64' | 'base64url';
type HashAlgorithm = 'md5' | 'sha1' | 'sha256' | 'sha384' | 'sha512';

interface HashBuilder {
  /** Adiciona dados ao buffer (encadeável). */
  update(data: string): HashBuilder;
  /** Finaliza e retorna o digest na codificação solicitada (default 'hex'). */
  digest(encoding?: CryptoEncoding): string;
}

interface RandomBytesBuffer extends Uint8Array {
  /** Serializa os bytes em hex, base64 ou utf8. */
  toString(encoding?: 'hex' | 'base64' | 'utf8' | 'utf-8'): string;
}

interface Crypto {
  /** UUID v4 cryptographically random. */
  randomUUID(): string;
  /**
   * Retorna 'count' bytes aleatórios (0–65536). O resultado é um Uint8Array
   * com .toString('hex' | 'base64') injetado para facilitar uso.
   * @example crypto.randomBytes(32).toString('hex')  // 64 chars
   */
  randomBytes(count: number): RandomBytesBuffer;
  /** Preenche o Uint8Array com bytes aleatórios (interface Web Crypto). */
  getRandomValues<T extends Uint8Array>(typedArray: T): T;
  /**
   * Inicia o cálculo de hash. Suporta md5, sha1, sha256, sha384, sha512.
   * @example crypto.createHash('sha256').update(data).digest('hex')
   */
  createHash(algorithm: HashAlgorithm): HashBuilder;
  /**
   * Inicia o cálculo de HMAC. Útil para assinar/verificar webhooks.
   * @example crypto.createHmac('sha256', secret).update(payload).digest('hex')
   */
  createHmac(algorithm: HashAlgorithm, key: string): HashBuilder;
}
declare const crypto: Crypto;

// ============================================
// sleep — pausa síncrona
// ============================================

/**
 * Pausa a execução do script por 'ms' milissegundos.
 *
 * Bloqueia a thread do worker — útil para retry com backoff ou throttling.
 * Cap de segurança de 30s; valores maiores são truncados.
 *
 * @example
 * for (let i = 0; i < 3; i++) {
 *   const res = await fetch(url);
 *   if (res.ok) return await res.json();
 *   sleep(1000 * Math.pow(2, i)); // backoff: 1s, 2s, 4s
 * }
 */
declare function sleep(ms: number): void;

// ============================================
// Download de Arquivos
// ============================================

interface DownloadFileOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
  /** Nome do arquivo para salvar. Se não informado, será inferido da resposta ou URL. */
  fileName?: string;
}

interface DownloadFileSuccessResponse {
  ok: true;
  /** ID do anexo criado */
  id: string;
  /** URL pública do arquivo */
  url: string;
  /** Nome do anexo */
  name: string;
  /** Nome do arquivo */
  fileName: string;
  /** Tipo MIME do arquivo */
  contentType: string;
  /** Tamanho do arquivo em bytes */
  size: number;
}

interface DownloadFileErrorResponse {
  ok: false;
  /** Código de status HTTP */
  status: number;
  /** Mensagem de erro */
  error: string;
}

type DownloadFileResponse = DownloadFileSuccessResponse;

/**
 * Faz o download de um arquivo a partir de uma URL e o salva como anexo.
 * @example
 * const result = downloadFile('https://example.com/file.pdf')
 * if (result.ok) {
 *   console.log(result.url)  // URL do arquivo salvo
 *   console.log(result.size) // tamanho em bytes
 * }
 * @example downloadFile('https://example.com/file.pdf', { fileName: 'relatorio.pdf', headers: { Authorization: 'Bearer token' } })
 */
declare function downloadFile(url: string, options?: DownloadFileOptions): DownloadFileResponse;

// ============================================
// Google Maps — Rotas
// ============================================

type MapsTravelMode = 'DRIVE' | 'WALK' | 'BICYCLE' | 'TWO_WHEELER' | 'TRANSIT';

interface MapsRoutesOptions {
  /** Modo de transporte. Padrão: 'DRIVE'. */
  travelMode?: MapsTravelMode;
  /** Idioma das descrições retornadas. Padrão: 'pt-BR'. */
  language?: string;
  /** Região usada como viés na geocodificação dos endereços. Padrão: 'br'. */
  region?: string;
  /** Sistema de unidades. Padrão: 'METRIC'. */
  units?: 'METRIC' | 'IMPERIAL';
  /** Evita pedágios na rota. */
  avoidTolls?: boolean;
  /** Evita rodovias na rota. */
  avoidHighways?: boolean;
  /** Evita balsas na rota. */
  avoidFerries?: boolean;
  /** Horário de partida em ISO8601. Ativa o cálculo com trânsito (apenas DRIVE / TWO_WHEELER). */
  departureTime?: string;
  /** Critério de ordenação. Padrão: 'distance' (da mais curta à mais longa). */
  sortBy?: 'distance' | 'duration';
  /** Número máximo de rotas retornadas. Padrão e teto: 5. */
  maxRoutes?: number;
}

interface MapsRoute {
  /** Posição da rota após a ordenação (0 = a mais curta). */
  index: number;
  /** Descrição resumida da rota (ex.: 'Av. Paulista'). Pode ser null. */
  summary: string | null;
  /** Distância total em metros. */
  distanceMeters: number;
  /** Distância formatada (ex.: '2,4 km' ou '850 m'). */
  distanceText: string | null;
  /** Duração estimada em segundos. */
  durationSeconds: number | null;
  /** Duração formatada (ex.: '8 min' ou '1 h 20 min'). */
  durationText: string | null;
  /** Duração sem considerar trânsito, em segundos. */
  staticDurationSeconds: number | null;
  /** Polyline codificada do traçado, para desenhar no mapa. */
  encodedPolyline: string | null;
  /** Avisos da Google sobre a rota (pedágio, via restrita, etc.). */
  warnings: string[];
}

interface MapsRoutesSuccessResponse {
  ok: true;
  /** Quantidade de rotas retornadas. */
  count: number;
  origin: string;
  destination: string;
  travelMode: MapsTravelMode;
  sortBy: 'distance' | 'duration';
  /** Rotas alternativas ordenadas da mais curta à mais longa. */
  routes: MapsRoute[];
}

interface MapsRoutesErrorResponse {
  ok: false;
  /** Código de status HTTP (400 para parâmetro inválido, 500 para falha interna). */
  status: number;
  /** Mensagem de erro. */
  error: string;
  /** Corpo bruto devolvido pela Google, quando disponível. */
  details?: any;
}

type MapsRoutesResponse = MapsRoutesSuccessResponse | MapsRoutesErrorResponse;

interface Maps {
  /**
   * Calcula as rotas entre dois endereços usando o Google Maps.
   * Retorna as alternativas ordenadas da mais curta à mais longa.
   *
   * A chave de API fica no servidor — não é necessário (nem possível) informá-la aqui.
   * A chamada é síncrona: não use await.
   *
   * @param origin - Endereço de origem em texto livre.
   * @param destination - Endereço de destino em texto livre.
   * @param options - Modo de transporte, idioma, restrições e ordenação.
   * @returns Objeto com as rotas ou, em caso de falha, ok: false e a mensagem de erro.
   *
   * @example
   * const res = maps.routes(
   *   'Av. Paulista, 1000, São Paulo',
   *   'Rua Augusta, 500, São Paulo'
   * );
   *
   * if (!res.ok) throw new Error(res.error);
   *
   * // A primeira rota é sempre a mais curta
   * const melhor = res.routes[0];
   * console.log(melhor.distanceText, melhor.durationText); // '2,4 km' '8 min'
   *
   * @example
   * // Ordenando pelo tempo estimado e evitando pedágios
   * const res = maps.routes('Campinas, SP', 'Santos, SP', {
   *   travelMode: 'DRIVE',
   *   sortBy: 'duration',
   *   avoidTolls: true,
   *   maxRoutes: 3
   * });
   *
   * res.ok && res.routes.forEach(r => {
   *   console.log(r.index, r.summary, r.distanceText, r.durationText);
   * });
   *
   * @example
   * // Rota a pé, com horário de partida para considerar trânsito
   * maps.routes('Rodoviária de Belo Horizonte', 'Praça da Liberdade', {
   *   travelMode: 'WALK',
   *   language: 'pt-BR'
   * });
   */
  routes(origin: string, destination: string, options?: MapsRoutesOptions): MapsRoutesResponse;
}

declare const maps: Maps;

// ============================================
// Console
// ============================================

interface Console {
  /** Registra uma mensagem no console. */
  log(...args: any[]): void;
  /** Registra uma mensagem de erro no console. */
  error(...args: any[]): void;
  /** Registra uma mensagem de aviso no console. */
  warn(...args: any[]): void;
}

declare const console: Console;

// ============================================
// Armazenamento do Contato
// ============================================

interface ContactStorage {
  /**
   * Recupera um item do armazenamento do contato.
   * @example contactStorage.getItem('key')
   */
  getItem(key: string): string | null;
  /**
   * Armazena um item no armazenamento do contato.
   * @example contactStorage.setItem('key', 'value')
   */
  setItem(key: string, value: any): void;
}

interface ContactAttribute {
  /**
   * Recupera o valor de um atributo do contato. O atributo é o campo que aparece no chat do contato.
   * @example contactAttribute.getItem('key')
   */
  getItem(key: string): string | null;
  /**
   * Define o valor de um atributo do contato.
   * @example contactAttribute.setItem('key', 'value')
   * O valor é convertido para string antes de ser armazenado.
   * Se o valor for null ou undefined, o atributo é removido.
   * @returns true se o atributo foi definido ou removido, false se houve erro
   * @example contactAttribute.setItem('key', null) // remove o atributo 'key'
   */
  setItem(key: string, value: any): boolean;
}

declare const contactStorage: ContactStorage;
declare const contactAttribute: ContactAttribute;

// ============================================
// Informações do Contato
// ============================================

interface ContactInfo {
  id: string;
  name: string;
  external_id: string;
  phone_number: string;
}

/**
 * Recupera informações sobre o contato atual.
 * @example getContactInfo()
 */
declare function getContactInfo(): ContactInfo;

// ============================================
// Coleções (Banco de Dados Dinâmico)
// ============================================

/** Resultado padrão retornado pelas operações de coleção */
interface CollectionResult<T = Record<string, any>> {
  /** Dados retornados pela operação */
  data: T;
  /** Se a operação foi bem-sucedida */
  ok: boolean;
  /** Mensagem de erro (quando ok=false) */
  error?: string;
}

/** Opções de paginação para collection.Paginate */
interface PaginateOptions {
  /** Quantidade de registros por página (padrão: 20, máximo: 200) */
  limit?: number;
  /** Quantidade de registros a pular */
  skip?: number;
  /** Ordenação dos resultados. Ex: { campo: 'asc' } ou { campo: 'desc' } */
  sort?: Record<string, 'asc' | 'desc'>;
}

/** Resultado paginado retornado por collection.Paginate */
interface PaginateResult {
  /** Registros da página atual */
  data: Record<string, any>[];
  /** Total de registros que atendem ao critério */
  total: number;
  /** Limite aplicado */
  limit: number;
  /** Offset aplicado */
  skip: number;
  /** Se existem mais registros após esta página */
  has_more: boolean;
  ok: boolean;
}

/** Resultado de operações em massa (UpdateWhere, DeleteWhere) */
interface BulkOperationResult {
  data: { updated?: number; deleted?: number };
  ok: boolean;
}

/** Resultado de Upsert com indicação se foi inserção ou atualização */
interface UpsertResult {
  data: Record<string, any>;
  ok: boolean;
  /** true se um novo registro foi criado, false se um existente foi atualizado */
  upserted: boolean;
}

/** Informações de uma tabela */
interface TableInfo {
  id: string;
  name: string;
}

/** Resultado de DropTable */
interface DropTableResult {
  data: { table: string; deleted_records: number };
  ok: boolean;
}

interface Collection {
  // ── CRUD Básico ─────────────────────────────────────────────

  /**
   * Cria um novo registro na coleção especificada.
   * Se a tabela não existir, ela será criada automaticamente.
   * @param tableName - Nome da tabela/coleção
   * @param data - Dados do registro
   * @returns Registro criado com id
   * @example collection.Create('clientes', { nome: 'João', email: 'joao@email.com' })
   */
  Create(tableName: string, data: Record<string, any>): CollectionResult;

  /**
   * Busca registros que correspondem aos critérios fornecidos.
   * @param tableName - Nome da tabela/coleção
   * @param criteria - Filtros de busca (campo: valor)
   * @returns Lista de registros encontrados
   * @example collection.Where('clientes', { cidade: 'São Paulo' })
   */
  Where(tableName: string, criteria: Record<string, any>): CollectionResult<Record<string, any>[]>;

  /**
   * Atualiza um registro existente pelo ID (merge parcial).
   * Os campos fornecidos são mesclados com os dados existentes.
   * @param tableName - Nome da tabela/coleção
   * @param id - ID do registro
   * @param data - Dados a serem atualizados (merge)
   * @returns Registro atualizado
   * @example collection.Update('clientes', '507f1f77bcf86cd799439011', { email: 'novo@email.com' })
   */
  Update(tableName: string, id: string, data: Record<string, any>): CollectionResult;

  /**
   * Remove um registro da coleção pelo ID.
   * @param tableName - Nome da tabela/coleção
   * @param id - ID do registro a ser removido
   * @returns Registro removido
   * @example collection.Delete('clientes', '507f1f77bcf86cd799439011')
   */
  Delete(tableName: string, id: string): CollectionResult;

  // ── Consultas ───────────────────────────────────────────────

  /**
   * Busca um único registro pelo ID.
   * @param tableName - Nome da tabela/coleção
   * @param id - ID do registro
   * @returns Registro encontrado ou erro
   * @example
   * const result = collection.FindById('clientes', '507f1f77bcf86cd799439011')
   * if (result.ok) console.log(result.data.nome)
   */
  FindById(tableName: string, id: string): CollectionResult;

  /**
   * Retorna o primeiro registro que atende aos critérios.
   * Diferente de Where, retorna um único objeto (não array).
   * @param tableName - Nome da tabela/coleção
   * @param criteria - Filtros de busca
   * @returns Primeiro registro encontrado ou data=null
   * @example
   * const result = collection.FindOne('clientes', { email: 'joao@email.com' })
   * if (result.ok && result.data) console.log(result.data.nome)
   */
  FindOne(tableName: string, criteria: Record<string, any>): CollectionResult<Record<string, any> | null>;

  /**
   * Conta a quantidade de registros que atendem aos critérios.
   * @param tableName - Nome da tabela/coleção
   * @param criteria - Filtros de busca (opcional, {} para contar todos)
   * @returns Contagem de registros
   * @example
   * const result = collection.Count('clientes', { cidade: 'São Paulo' })
   * console.log('Total:', result.data) // Total: 42
   */
  Count(tableName: string, criteria?: Record<string, any>): CollectionResult<number>;

  /**
   * Verifica se existe pelo menos um registro que atende aos critérios.
   * @param tableName - Nome da tabela/coleção
   * @param criteria - Filtros de busca
   * @returns true se existir, false caso contrário
   * @example
   * const result = collection.Exists('clientes', { email: 'joao@email.com' })
   * if (result.data) console.log('Cliente já cadastrado!')
   */
  Exists(tableName: string, criteria?: Record<string, any>): CollectionResult<boolean>;

  /**
   * Busca registros com suporte a paginação e ordenação.
   * @param tableName - Nome da tabela/coleção
   * @param criteria - Filtros de busca
   * @param options - Opções de paginação: limit, skip, sort
   * @returns Resultado paginado com total, has_more, etc.
   * @example
   * // Página 1 com 10 itens, ordenados por nome crescente
   * const page1 = collection.Paginate('clientes', {}, { limit: 10, skip: 0, sort: { nome: 'asc' } })
   * console.log(page1.data)       // registros
   * console.log(page1.total)      // total geral
   * console.log(page1.has_more)   // true se há mais páginas
   *
   * // Página 2
   * const page2 = collection.Paginate('clientes', {}, { limit: 10, skip: 10, sort: { nome: 'asc' } })
   */
  Paginate(tableName: string, criteria: Record<string, any>, options?: PaginateOptions): PaginateResult;

  /**
   * Busca textual (case-insensitive) nos campos especificados.
   * Útil para implementar buscas por palavras-chave.
   * @param tableName - Nome da tabela/coleção
   * @param text - Texto a ser buscado
   * @param fields - Lista de campos onde buscar
   * @returns Registros que contêm o texto em algum dos campos
   * @example
   * // Busca "João" nos campos nome e email
   * const result = collection.Search('clientes', 'João', ['nome', 'email'])
   */
  Search(tableName: string, text: string, fields: string[]): CollectionResult<Record<string, any>[]>;

  /**
   * Retorna os valores únicos (distintos) de um campo.
   * @param tableName - Nome da tabela/coleção
   * @param field - Nome do campo
   * @param criteria - Filtros opcionais
   * @returns Array de valores únicos
   * @example
   * const result = collection.Distinct('clientes', 'cidade')
   * console.log(result.data) // ['São Paulo', 'Rio de Janeiro', 'Curitiba']
   */
  Distinct(tableName: string, field: string, criteria?: Record<string, any>): CollectionResult<string[]>;

  // ── Operações em Massa ──────────────────────────────────────

  /**
   * Cria múltiplos registros de uma vez (máximo 100 por chamada).
   * Se a tabela não existir, ela será criada automaticamente.
   * @param tableName - Nome da tabela/coleção
   * @param dataList - Array de objetos a serem criados
   * @returns Array de registros criados
   * @example
   * collection.BulkCreate('produtos', [
   *   { nome: 'Produto A', preco: 10 },
   *   { nome: 'Produto B', preco: 20 },
   *   { nome: 'Produto C', preco: 30 },
   * ])
   */
  BulkCreate(tableName: string, dataList: Record<string, any>[]): CollectionResult<Record<string, any>[]>;

  /**
   * Atualiza todos os registros que atendem aos critérios.
   * Os campos fornecidos são mesclados (merge) com os dados existentes.
   * @param tableName - Nome da tabela/coleção
   * @param criteria - Filtros para selecionar registros
   * @param data - Dados a serem aplicados (merge)
   * @returns Quantidade de registros atualizados
   * @example
   * // Marca todos os clientes de SP como ativos
   * collection.UpdateWhere('clientes', { cidade: 'São Paulo' }, { ativo: true })
   */
  UpdateWhere(tableName: string, criteria: Record<string, any>, data: Record<string, any>): BulkOperationResult;

  /**
   * Remove todos os registros que atendem aos critérios.
   * Requer ao menos um critério para evitar exclusão acidental de todos os registros.
   * @param tableName - Nome da tabela/coleção
   * @param criteria - Filtros para selecionar registros (obrigatório, não pode ser vazio)
   * @returns Quantidade de registros removidos
   * @example
   * // Remove todos os pedidos cancelados
   * collection.DeleteWhere('pedidos', { status: 'cancelado' })
   */
  DeleteWhere(tableName: string, criteria: Record<string, any>): BulkOperationResult;

  // ── Operações Atômicas ──────────────────────────────────────

  /**
   * Atualiza um registro se existir, ou cria um novo caso contrário.
   * Quando cria, mescla os critérios de busca com os dados fornecidos.
   * @param tableName - Nome da tabela/coleção
   * @param criteria - Critérios para encontrar o registro existente
   * @param data - Dados a serem aplicados (merge se existir, merge com criteria se criar)
   * @returns Registro resultante + flag 'upserted' indicando se foi criado
   * @example
   * // Atualiza score do jogador ou cria se não existir
   * const result = collection.Upsert('jogadores', { nome: 'João' }, { score: 100 })
   * if (result.upserted) console.log('Novo jogador criado!')
   */
  Upsert(tableName: string, criteria: Record<string, any>, data: Record<string, any>): UpsertResult;

  /**
   * Incrementa (ou decrementa) um campo numérico de forma atômica.
   * Se o campo não existir, inicia com 0 e aplica o incremento.
   * @param tableName - Nome da tabela/coleção
   * @param id - ID do registro
   * @param field - Nome do campo numérico
   * @param amount - Valor a incrementar (negativo para decrementar). Padrão: 1
   * @returns Registro atualizado
   * @example
   * // Incrementa o score em 10
   * collection.Increment('jogadores', '507f1f77bcf86cd799439011', 'score', 10)
   *
   * // Decrementa o estoque em 1
   * collection.Increment('produtos', '507f1f77bcf86cd799439011', 'estoque', -1)
   */
  Increment(tableName: string, id: string, field: string, amount?: number): CollectionResult;

  // ── Agregação ───────────────────────────────────────────────

  /**
   * Executa uma operação de agregação nos registros.
   * @param tableName - Nome da tabela/coleção
   * @param field - Nome do campo para agregar (não necessário para 'count')
   * @param operation - Operação: 'sum', 'avg', 'min', 'max' ou 'count'
   * @param criteria - Filtros opcionais
   * @returns Resultado da agregação
   * @example
   * // Soma total de vendas
   * const total = collection.Aggregate('vendas', 'valor', 'sum')
   * console.log('Total:', total.data)
   *
   * // Média de preço dos produtos ativos
   * const media = collection.Aggregate('produtos', 'preco', 'avg', { ativo: true })
   *
   * // Contagem de pedidos pendentes
   * const count = collection.Aggregate('pedidos', null, 'count', { status: 'pendente' })
   *
   * // Menor e maior preço
   * const min = collection.Aggregate('produtos', 'preco', 'min')
   * const max = collection.Aggregate('produtos', 'preco', 'max')
   */
  Aggregate(
    tableName: string,
    field: string | null,
    operation: 'sum' | 'avg' | 'min' | 'max' | 'count',
    criteria?: Record<string, any>,
  ): CollectionResult<number | string | null>;

  // ── Gerenciamento de Tabelas ────────────────────────────────

  /**
   * Lista todas as tabelas/coleções da organização.
   * @returns Array com id e nome de cada tabela
   * @example
   * const result = collection.ListTables()
   * result.data.forEach(t => console.log(t.name))
   */
  ListTables(): CollectionResult<TableInfo[]>;

  /**
   * Remove uma tabela e todos os seus registros permanentemente.
   * ⚠️ Esta operação é irreversível!
   * @param tableName - Nome da tabela a ser removida
   * @returns Nome da tabela e quantidade de registros removidos
   * @example
   * const result = collection.DropTable('tabela_temporaria')
   * console.log('Registros removidos:', result.data.deleted_records)
   */
  DropTable(tableName: string): DropTableResult;
}

declare const collection: Collection;

// ============================================
// Tags
// ============================================

interface UserTag {
  name: string;
  description: string;
  color: string;
}

interface Tag {
  /**
   * Adiciona uma nova tag ao usuário atual.
   * @example tag.add('name')
   */
  add(name: string): void;
  /**
   * Remove uma tag existente do usuário atual.
   * @example tag.remove('name')
   */
  remove(name: string): void;
  /**
   * Lista as tags associadas ao usuário atual.
   * @example tag.listUserTags()
   */
  listUserTags(): UserTag[];
  /**
   * Lista todas as tags.
   * @example tag.list()
   */
  list(): string[];
}

declare const tag: Tag;

// ============================================
// Agendamentos (Appointment)
// ============================================

interface TimeSlot {
  start: string;
  end: string;
}

interface ScheduledAppointment {
  id: string;
  service_name: string;
  employee_name: string;
  start_time: string;
  end_time: string;
  status: string;
}

interface Service {
  id: string;
  name: string;
  duration: number;
}

interface Employee {
  id: string;
  name: string;
}

interface Appointment {
  /**
   * Retorna os horários disponíveis para um serviço em um período.
   * @param serviceName - Nome do serviço
   * @param dateStart - Data de início (YYYY-MM-DDTHH:mm:ss)
   * @param dateEnd - Data de fim (YYYY-MM-DDTHH:mm:ss)
   * @param employeeName - Nome do funcionário (opcional)
   * @returns Lista de horários disponíveis
   * @example appointment.serviceAvailableSlots('Corte de Cabelo', '2024-01-01T08:00:00', '2024-01-07T18:00:00', 'João')
   */
  serviceAvailableSlots(serviceName: string, dateStart: string, dateEnd: string, employeeName?: string): TimeSlot[];

  /**
   * Lista todos os agendamentos marcados.
   * @returns Lista de agendamentos
   * @example const list = appointment.scheduledList()
   */
  scheduledList(): any;

  /**
   * Cancela um agendamento pelo ID.
   * @param appointmentId - ID do agendamento
   * @example appointment.cancel('appointment_123')
   */
  cancel(appointmentId: string): void;

  /**
   * Cria um novo agendamento.
   * @param employeeName - Nome do funcionário
   * @param serviceName - Nome do serviço
   * @param startTime - Horário de início (ISO 8601)
   * @returns O agendamento criado
   * @example appointment.create('João', 'Corte de Cabelo', '2024-01-15T10:00:00')
   */
  create(employeeName: string, serviceName: string, startTime: string): any;

  /**
   * Lista todos os serviços disponíveis.
   * @returns Lista de serviços
   * @example appointment.services()
   */
  services(): any[];

  /**
   * Lista todos os funcionários disponíveis.
   * @returns Lista de funcionários
   * @example appointment.employees()
   */
  employees(): any[];
}

declare const appointment: Appointment;

// ============================================
// Turmas (Class Group)
// ============================================

interface ClassGroupInfo {
  id: string;
  name: string;
  description: string | null;
  instructor_name: string | null;
  room: string | null;
  max_students: number | null;
  enrolled_count: number;
  available_spots: number | null;
}

interface ClassGroupListItem extends ClassGroupInfo {
  schedule: string;
}

interface ClassGroupSession {
  date: string;
  end: string;
  enrollment_count: number;
  max_students: number | null;
}

interface ClassGroupAvailabilitySuccess extends ClassGroupInfo {
  sessions: ClassGroupSession[];
}

interface ClassGroupEnrollmentSuccess {
  success: true;
  enrollment_id: string;
  class_group_name: string;
  message: string;
}

interface ClassGroupUnenrollmentSuccess {
  success: true;
  class_group_name: string;
  message: string;
}

interface ClassGroupEnrollment {
  enrollment_id: string;
  class_group_id: string;
  class_group_name: string;
  instructor_name: string | null;
  room: string | null;
  enrolled_at: string | null;
}

interface ClassGroupErrorResponse {
  error: string;
}

type ClassGroupAvailabilityResponse =
  | ClassGroupAvailabilitySuccess
  | ClassGroupErrorResponse;

type ClassGroupEnrollmentResponse =
  | ClassGroupEnrollmentSuccess
  | ClassGroupErrorResponse;

type ClassGroupUnenrollmentResponse =
  | ClassGroupUnenrollmentSuccess
  | ClassGroupErrorResponse;

type ClassGroupMyEnrollmentsResponse =
  | ClassGroupEnrollment[]
  | ClassGroupErrorResponse;

interface ClassGroup {
  /**
   * Lista todas as turmas ativas e visíveis.
   * @example const groups = classGroup.list()
   */
  list(): ClassGroupListItem[];

  /**
   * Retorna as próximas sessões disponíveis de uma turma.
   * @param classGroupName - Nome da turma
   * @param daysAhead - Quantidade de dias a buscar a partir de hoje
   * @example classGroup.availability('Yoga', 14)
   */
  availability(
    classGroupName: string,
    daysAhead?: number,
  ): ClassGroupAvailabilityResponse;

  /**
   * Inscreve o contato atual em uma turma.
   * @param classGroupName - Nome da turma
   * @param dayOfWeek - Dia da semana (0=Domingo, 1=Segunda, 2=Terça, 3=Quarta, 4=Quinta, 5=Sexta, 6=Sábado)
   * @param windowStart - Horário de início da janela de inscrição (HH:mm, 24h)
   * @example classGroup.enroll('Pilates', 2, '10:00')
   */
  enroll(classGroupName: string, dayOfWeek: number, windowStart: string): ClassGroupEnrollmentResponse;

  /**
   * Cancela a inscrição do contato atual em uma turma.
   * @param classGroupName - Nome da turma
   * @param dayOfWeek - Dia da semana (0=Domingo, 1=Segunda, 2=Terça, 3=Quarta, 4=Quinta, 5=Sexta, 6=Sábado)
   * @param windowStart - Horário de início da janela de inscrição (HH:mm, 24h)
   * @example classGroup.unenroll('Pilates', 2, '10:00')
   */
  unenroll(classGroupName: string, dayOfWeek: number, windowStart: string): ClassGroupUnenrollmentResponse;

  /**
   * Lista as inscrições ativas do contato atual.
   * @example const enrollments = classGroup.myEnrollments()
   */
  myEnrollments(): ClassGroupMyEnrollmentsResponse;
}

declare const classGroup: ClassGroup;

// ============================================
// Kanban
// ============================================

/** Resultado padrão das operações de kanban */
interface KanbanResult<T = Record<string, any>> {
  ok: boolean;
  data?: T;
  error?: string;
  /** Quando ok=false em moveCard com gate de checklist */
  pending_items?: string[];
}

interface KanbanBoardSummary {
  id: string;
  name: string;
  board_type: 'standard' | 'crm';
  archived: boolean;
  columns: Array<{ id: string; name: string; position: number }>;
}

interface KanbanColumnInfo {
  id: string;
  name: string;
  position: number;
  color: string | null;
  wip_limit: number | null;
  sla_hours: number | null;
}

interface KanbanLabelInfo {
  id: string;
  name: string;
  color: string;
}

interface KanbanCustomFieldDefinition {
  id: string;
  key: string;
  name: string;
  field_type: 'text' | 'number' | 'date' | 'select' | 'checkbox' | 'url' | 'user';
  position: number;
  required: boolean;
  options: string[] | null;
  default_value: any;
}

interface KanbanCardInfo {
  id: string;
  title: string;
  description: string | null;
  status: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent' | null;
  due_date: string | null;
  position: number;
  kanban_column_id: string;
  assigned_to_id: string | null;
  conversation_id: string | null;
  tags: string[];
  color_label: string | null;
  custom_field_values: Record<string, any>;
  archived: boolean;
  completed_at: string | null;
  deal_value: number | null;
  deal_probability: number | null;
  company_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  won_at: string | null;
  lost_at: string | null;
  lost_reason: string | null;
  labels: KanbanLabelInfo[];
}

interface KanbanChecklistItemInfo {
  id: string;
  title: string;
  completed: boolean;
  position: number;
}

interface KanbanChecklistInfo {
  id: string;
  name: string;
  position: number;
  items: KanbanChecklistItemInfo[];
}

interface KanbanCommentInfo {
  id: string;
  body: string;
  admin_user_id: string | null;
  pinned: boolean;
  created_at: string;
  edited_at: string | null;
}

interface KanbanBoardDetail extends KanbanBoardSummary {
  description: string | null;
  color: string | null;
  icon: string | null;
  custom_field_definitions: KanbanCustomFieldDefinition[];
}

/** Referência por id (number) ou nome (string, case-insensitive). */
type KanbanRef = number | string;

interface KanbanCardFilters {
  /** Por padrão lista apenas cards vinculados à conversa atual. Passe true para todos. */
  allConversations?: boolean;
  /** Filtra para apenas cards de uma coluna específica do board. */
  column_id?: number;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  assigned_to_id?: number;
  tags?: string[];
  search?: string;
  overdue?: boolean;
  archived?: boolean;
}

interface KanbanCreateCardAttrs {
  title?: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  due_date?: string;
  deal_value?: number;
  deal_probability?: number;
  company_name?: string;
  contact_email?: string;
  contact_phone?: string;
  expected_close_date?: string;
  tags?: string[];
  custom_field_values?: Record<string, any>;
  color_label?: string;
  assigned_to_id?: number;
  /** Padrão true: usa o criador de card da conversa e liga à conversa. */
  linkConversation?: boolean;
}

interface KanbanUpdateCardAttrs {
  title?: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  due_date?: string | null;
  deal_value?: number | null;
  deal_probability?: number | null;
  company_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  expected_close_date?: string | null;
  tags?: string[];
  custom_field_values?: Record<string, any>;
}

interface Kanban {
  // ── Discovery ────────────────────────────────────────────────
  /**
   * Lista os boards ativos da organização.
   * Resultado fica cacheado no contexto da sessão de IA.
   * @example const boards = kanban.listBoards()
   */
  listBoards(): KanbanResult<KanbanBoardSummary[]>;

  /**
   * Retorna um board com colunas, custom fields e labels.
   * Aceita id numérico ou nome (case-insensitive).
   * @example kanban.getBoard(123)
   * @example kanban.getBoard('Pipeline Vendas')
   */
  getBoard(boardRef: KanbanRef): KanbanResult<KanbanBoardDetail>;

  /**
   * Lista colunas de um board. Aceita id ou nome do board.
   * @example kanban.listColumns('Pipeline Vendas')
   */
  listColumns(boardRef: KanbanRef): KanbanResult<KanbanColumnInfo[]>;

  /**
   * Lista cards de um board. Por padrão filtra pela conversa atual.
   * Aceita id ou nome do board.
   * @example kanban.listCards('Pipeline Vendas') // apenas cards desta conversa
   * @example kanban.listCards(123, { allConversations: true, priority: 'high' })
   */
  listCards(boardRef: KanbanRef, filters?: KanbanCardFilters): KanbanResult<KanbanCardInfo[]>;

  /**
   * Retorna todos os cards da organização vinculados à conversa atual.
   * @example const myCards = kanban.findCardsForConversation()
   */
  findCardsForConversation(): KanbanResult<KanbanCardInfo[]>;

  /**
   * Lista as labels da organização.
   * @example kanban.listLabels()
   */
  listLabels(): KanbanResult<KanbanLabelInfo[]>;

  // ── CRUD de cards ────────────────────────────────────────────
  /**
   * Cria um card. Por padrão liga à conversa automaticamente.
   * Aceita id ou nome em board e coluna.
   * @example kanban.createCard('Pipeline Vendas', 'Novos', { title: 'Lead interessado', priority: 'high' })
   */
  createCard(boardRef: KanbanRef, columnRef: KanbanRef, attrs?: KanbanCreateCardAttrs): KanbanResult<KanbanCardInfo>;

  /** Retorna um card específico da organização. */
  getCard(cardId: string): KanbanResult<KanbanCardInfo>;

  /**
   * Atualiza campos de um card (whitelist em KanbanUpdateCardAttrs).
   * @example kanban.updateCard(789, { priority: 'urgent', deal_value: 1500 })
   */
  updateCard(cardId: string, attrs: KanbanUpdateCardAttrs): KanbanResult<KanbanCardInfo>;

  /**
   * Move o card para outra coluna (e opcionalmente posição).
   * Respeita gates de checklist obrigatório da coluna de origem —
   * se incompleto e a coluna de destino for adiante, devolve
   * { ok: false, error: 'checklist_incomplete', pending_items: [...] }.
   * Aceita id ou nome da coluna de destino.
   * Por padrão insere o card no topo da coluna; passe atEnd=true para colocar no fim.
   * @example kanban.moveCard(789, 'Fechado')
   * @example kanban.moveCard(789, 'Fechado', true) // ao fim da coluna
   */
  moveCard(cardId: string, columnRef: KanbanRef, atEnd?: boolean): KanbanResult<KanbanCardInfo>;

  /**
   * Arquiva ou desarquiva um card.
   * @example kanban.archiveCard(789)
   * @example kanban.archiveCard(789, true) // desarquiva
   */
  archiveCard(cardId: string, undo?: boolean): KanbanResult<KanbanCardInfo>;

  // ── CRM (deals) ──────────────────────────────────────────────
  /** Marca o deal como ganho. */
  markWon(cardId: string): KanbanResult<KanbanCardInfo>;
  /** Marca o deal como perdido, com motivo opcional. */
  markLost(cardId: string, reason?: string): KanbanResult<KanbanCardInfo>;
  /** Reabre um deal já fechado (won ou lost). */
  reopenDeal(cardId: string): KanbanResult<KanbanCardInfo>;

  // ── Labels ───────────────────────────────────────────────────
  /**
   * Anexa uma label ao card. Aceita id OU nome (cria a label na organização se não existir).
   * @example kanban.addLabel(789, 'quente')
   * @example kanban.addLabel(789, 42)
   */
  addLabel(cardId: string, labelIdOrName: number | string): KanbanResult<KanbanLabelInfo>;

  /** Remove uma label do card. */
  removeLabel(cardId: string, labelId: string): KanbanResult;

  // ── Custom fields ────────────────────────────────────────────
  /**
   * Define o valor de um custom field do card (chave é o atributo key do field definition).
   * @example kanban.setCustomField(789, 'origem_lead', 'instagram_ads')
   */
  setCustomField(cardId: string, key: string, value: any): KanbanResult<KanbanCardInfo>;

  /** Lista as definições de custom fields de um board (id ou nome). */
  getCustomFields(boardRef: KanbanRef): KanbanResult<KanbanCustomFieldDefinition[]>;

  /**
   * Lê um custom field de um card resolvendo a referência por key OU nome
   * (case-insensitive e acento-insensitive).
   */
  getCustomField(cardId: string, key: string): KanbanResult<{ key: string; value: any }>;

  // ── Checklists ───────────────────────────────────────────────
  /** Cria um novo checklist no card. */
  addChecklist(cardId: string, name: string): KanbanResult<KanbanChecklistInfo>;
  /** Adiciona um item a um checklist existente. */
  addChecklistItem(checklistId: string, title: string): KanbanResult<KanbanChecklistItemInfo>;
  /** Alterna o estado de um item de checklist. */
  toggleChecklistItem(itemId: string): KanbanResult<KanbanChecklistItemInfo>;
  /** Lista checklists e itens de um card. */
  listChecklists(cardId: string): KanbanResult<KanbanChecklistInfo[]>;

  // ── Comments ─────────────────────────────────────────────────
  /**
   * Adiciona um comentário ao card. Autor herda do usuário atribuído da conversa
   * (fallback: primeiro usuário da organização).
   * @example kanban.addComment(789, 'Lead pediu retorno na sexta')
   */
  addComment(cardId: string, body: string): KanbanResult<KanbanCommentInfo>;

  /** Lista os comentários de um card (mais recentes primeiro). */
  listComments(cardId: string, limit?: number): KanbanResult<KanbanCommentInfo[]>;

  // ── Fluent API ───────────────────────────────────────────────
  /**
   * Atalho fluent para o board (aceita id ou nome). Devolve um objeto com métodos
   * encadeáveis (board.column('Novos').createCard(...), etc.) ou null se não encontrado.
   * @example
   * const board = kanban.board('Pipeline Vendas');
   * const card = board.column('Novos').createCard({ title: 'Lead' });
   */
  board(ref: KanbanRef): KanbanBoardFluent | null;

  /**
   * Atalho fluent que devolve todos os boards da organização como objetos com métodos.
   * Equivalente a kanban.listBoards().data.map(...) com helpers acoplados.
   */
  boards(): KanbanBoardFluent[];

  /** Atalho fluent para um card específico (id). */
  card(id: string): KanbanCardFluent | null;

  /** Cards desta conversa (em qualquer board da organização), com métodos fluent. */
  cardsForConversation(): KanbanCardFluent[];

  /** Atalho fluent para labels da organização. */
  labels(): KanbanLabelInfo[];
}

// ── Fluent return shapes ──────────────────────────────────────

interface KanbanChecklistItemFluent extends KanbanChecklistItemInfo {
  /** Alterna o estado 'completed' do item. Retorna o item atualizado. */
  toggle(): KanbanChecklistItemFluent | null;
}

interface KanbanChecklistFluent extends Omit<KanbanChecklistInfo, 'items'> {
  items: KanbanChecklistItemFluent[];
  /** Adiciona um item ao checklist. */
  addItem(title: string): KanbanChecklistItemFluent | null;
}

interface KanbanCardFluent extends KanbanCardInfo {
  /** Atualiza atributos (whitelist em KanbanUpdateCardAttrs). */
  update(attrs: KanbanUpdateCardAttrs): KanbanCardFluent | null;
  /**
   * Move para outra coluna. columnRef é id ou nome. Por padrão insere no topo;
   * passe atEnd=true para colocar no fim. Devolve { ok: false, ... } se
   * bloqueado por checklist.
   */
  moveTo(columnRef: KanbanRef, atEnd?: boolean): KanbanCardFluent | KanbanResult;
  archive(): KanbanCardFluent | null;
  unarchive(): KanbanCardFluent | null;
  markWon(): KanbanCardFluent | null;
  markLost(reason?: string): KanbanCardFluent | null;
  reopen(): KanbanCardFluent | null;
  /** Anexa label (id ou nome — cria se não existir). */
  addLabel(labelRef: KanbanRef): KanbanLabelInfo | null;
  removeLabel(labelId: string): KanbanResult;
  /**
   * Atualiza um custom field e devolve o card refletindo a mudança.
   * A key resolve por nome OU key (case-insensitive, acento-insensitive).
   * Em campos select, o value também é casado contra as options definidas.
   */
  setCustomField(key: string, value: any): KanbanCardFluent | null;
  /**
   * Lê o valor de um custom field. Aceita key ou nome do field.
   * Devolve null se o campo não está setado.
   */
  getCustomField(key: string): any;
  addChecklist(name: string): KanbanChecklistFluent | null;
  checklists(): KanbanChecklistFluent[];
  addComment(body: string): KanbanCommentInfo | null;
  comments(limit?: number): KanbanCommentInfo[];
  /** Recarrega o card a partir do banco. */
  refresh(): KanbanCardFluent | null;
}

interface KanbanColumnFluent extends KanbanColumnInfo {
  /** Lista cards desta coluna (já aplica filtro column_id). Combina filtros adicionais. */
  cards(filters?: KanbanCardFilters): KanbanCardFluent[];
  /** Cria um card direto nesta coluna (vincula à conversa atual por padrão). */
  createCard(attrs?: KanbanCreateCardAttrs): KanbanCardFluent | null;
}

interface KanbanBoardFluent extends Omit<KanbanBoardDetail, 'columns'> {
  columns: KanbanColumnFluent[];
  /** Localiza uma coluna pelo id ou nome (case-insensitive). */
  column(ref: KanbanRef): KanbanColumnFluent | undefined;
  /** Lista cards do board (filtros opcionais). */
  cards(filters?: KanbanCardFilters): KanbanCardFluent[];
  /** Cards deste board vinculados à conversa atual (atalho equivalente a cards()). */
  cardsForConversation(): KanbanCardFluent[];
  /** Cria um card no board. columnRef é id ou nome de coluna deste board. */
  createCard(columnRef: KanbanRef, attrs?: KanbanCreateCardAttrs): KanbanCardFluent | KanbanResult;
  /** Lista as definições de custom fields deste board. */
  customFields(): KanbanCustomFieldDefinition[];
  /** Recarrega o board a partir do banco. */
  refresh(): KanbanBoardFluent | null;
}

declare const kanban: Kanban;

// ============================================
// catalog: o catálogo de produtos, só leitura
// ============================================

interface CatalogItem {
  id: string;
  sku: string | null;
  title: string;
  summary: string | null;
  url: string | null;
  tags: string[];
  /** URL absoluta, pronta para enviar como mídia. */
  image: string | null;
  images: string[];
  fields: Record<string, any>;
}

interface CatalogResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  total?: number;
  strategy?: string;
}

interface CatalogSearchOptions {
  categories?: string[];
  tags?: string[];
  custom?: Record<string, any>;
  /** Padrão 5, até 20. */
  limit?: number;
  includeInactive?: boolean;
}

interface Catalog {
  /**
   * Busca no catálogo, com a mesma busca da tela. Conta na cota de rede.
   * @example catalog.Search('caneca', { limit: 3 })
   */
  Search(query: string, options?: CatalogSearchOptions): CatalogResult<CatalogItem[]>;
  /** Um item, pelo id ou pelo SKU. */
  Get(idOrSku: string): CatalogResult<CatalogItem & { description: string | null; categories: string[] }>;
  /** As categorias, com a quantidade de itens. */
  Categories(): CatalogResult<{ path: string; name: string; items: number }[]>;
  /** Os valores de 'tags' ou de um campo personalizado. */
  Facets(field: string): CatalogResult<{ value: string; count: number }[]>;
  /** Itens parecidos, por proximidade de embedding. */
  Similar(idOrSku: string, limit?: number): CatalogResult<CatalogItem[]>;
}
declare const catalog: Catalog;

// ============================================
// Gerenciamento de Usuários
// ============================================

interface User {
  id: string;
  name: string;
  email: string;
}

/**
 * Atribui um usuário ao contato.
 * @example assignUser(userId)
 */
declare function assignUser(departmentName: string): boolean;

/**
 * Atribui um usuário ao contato via email.
 * @example assignUserByEmail('user@example.com')
 */
declare function assignUserByEmail(email: string | null): boolean;

/**
 * Atribui um departamento ao contato.
 * @example assignDepartmentByName(departmentName)
 */
declare function assignDepartmentByName(departmentName: string): boolean;

/**
 * Recupera o usuário atribuído ao contato.
 * @example assignedUser() // { id, name, email }
 */
declare function assignedUser(): User | null;

/**
 * Recupera a lista de todos os usuários.
 * @example userList() // [{ id, name, email }]
 */
declare function userList(): User[];

/**
 * Liga a automação para o contato atual.
 * @example enableAutomation()
 */
declare function enableAutomation(): boolean;

/**
 * Desliga a automação para o contato atual.
 * @example disableAutomation()
 */
declare function disableAutomation(): boolean;
`
}
