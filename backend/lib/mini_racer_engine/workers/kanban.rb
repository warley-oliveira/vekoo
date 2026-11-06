module MiniRacerEngine::Workers
  # `kanban.*`: os quadros de pipeline para quem automatiza. O nome da API JS, e `column`, `conversation`
  # e `board` dentro dela, são contrato de quem escreve script, e não seguem o resto do domínio
  # (`Pipelines::Stage`, `chat_id`). Guia de uso: docs/mini_racer_kanban_worker.md na origem, e a seção
  # "API JS" de docs/migration/api/pipelines.md.
  #
  # A diferença para a origem que quem escreve script sente: os ids agora são texto (UUID), e não
  # número. Toda referência de quadro, etapa e etiqueta tenta o id e depois o nome.
  class Kanban < MiniRacerEngine::EngineModule
    UPDATE_WHITELIST = %i[
      title description priority due_date deal_value deal_probability
      company_name contact_email contact_phone expected_close_date
      tags custom_field_values
    ].freeze

    CREATE_WHITELIST = (UPDATE_WHITELIST + %i[color_label assigned_to_id]).freeze

    # Coleção grande não entra na memória: `board.cards({ allConversations: true })` para aqui.
    MAX_LISTED_CARDS = 1_000

    # Marcado no contexto por quem roda o script a partir de um gatilho: o que o script mudar não
    # dispara outro gatilho. Sem isto, um gatilho de "card movido" que move o card rodaria para sempre.
    SUPPRESS_TRIGGERS_KEY = :pipelines_suppress_triggers
    # Quem assina o comentário: `script` (padrão) ou `flow`.
    COMMENT_SOURCE_KEY = :pipelines_comment_source

    NUMERIC_TEXT = '^-?[0-9]+(\.[0-9]+)?$'.freeze

    # Envelopa o que o Ruby devolve com métodos encadeáveis (kanban.board(...).column(...).createCard(...),
    # card.moveTo('Fechado')). As funções primitivas continuam disponíveis lado a lado.
    BOOTSTRAP_JS = <<~'JS'.freeze
      (function() {
        if (typeof kanban !== 'object' || kanban === null) return;
        if (kanban.__fluentBootstrapped) return;
        kanban.__fluentBootstrapped = true;

        // Linha de quem chamou: não faz nada em produção, e serve à tela de testar script.
        const _t = (typeof __traceCallerLine === 'function') ? __traceCallerLine : function() {};

        const _raw = {
          listBoards: kanban.listBoards,
          getBoard: kanban.getBoard,
          listColumns: kanban.listColumns,
          listCards: kanban.listCards,
          listLabels: kanban.listLabels,
          findCardsForConversation: kanban.findCardsForConversation,
          createCard: kanban.createCard,
          getCard: kanban.getCard,
          updateCard: kanban.updateCard,
          moveCard: kanban.moveCard,
          archiveCard: kanban.archiveCard,
          markWon: kanban.markWon,
          markLost: kanban.markLost,
          reopenDeal: kanban.reopenDeal,
          addLabel: kanban.addLabel,
          removeLabel: kanban.removeLabel,
          setCustomField: kanban.setCustomField,
          getCustomFields: kanban.getCustomFields,
          getCustomField: kanban.getCustomField,
          getRelevantCustomFields: kanban.getRelevantCustomFields,
          incrementCustomField: kanban.incrementCustomField,
          getCustomFieldNumber: kanban.getCustomFieldNumber,
          addChecklist: kanban.addChecklist,
          addChecklistItem: kanban.addChecklistItem,
          toggleChecklistItem: kanban.toggleChecklistItem,
          listChecklists: kanban.listChecklists,
          addComment: kanban.addComment,
          listComments: kanban.listComments
        };

        function _data(r) { return (r && r.ok) ? r.data : null; }

        // Sem acento e sem caixa, como a busca de quadro e etapa no Ruby.
        function _norm(text) {
          return String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
        }

        function _wrapItem(raw) {
          if (!raw) return raw;
          raw.toggle = function() { _t(); return _wrapItem(_data(_raw.toggleChecklistItem(this.id))); };
          return raw;
        }

        function _wrapChecklist(raw) {
          if (!raw) return raw;
          if (Array.isArray(raw.items)) raw.items = raw.items.map(_wrapItem);
          raw.addItem = function(title) { _t(); return _wrapItem(_data(_raw.addChecklistItem(this.id, title))); };
          return raw;
        }

        function _wrapCard(raw) {
          if (!raw) return raw;
          raw.update = function(attrs) { _t(); return _wrapCard(_data(_raw.updateCard(this.id, attrs))); };
          raw.moveTo = function(columnRef, atEnd) {
            _t();
            const r = _raw.moveCard(this.id, columnRef, !!atEnd);
            if (!r.ok) return r;
            return _wrapCard(r.data);
          };
          raw.archive   = function() { _t(); return _wrapCard(_data(_raw.archiveCard(this.id, false))); };
          raw.unarchive = function() { _t(); return _wrapCard(_data(_raw.archiveCard(this.id, true))); };
          raw.markWon   = function() { _t(); return _wrapCard(_data(_raw.markWon(this.id))); };
          raw.markLost  = function(reason) { _t(); return _wrapCard(_data(_raw.markLost(this.id, reason))); };
          raw.reopen    = function() { _t(); return _wrapCard(_data(_raw.reopenDeal(this.id))); };
          raw.addLabel    = function(ref) { _t(); return _data(_raw.addLabel(this.id, ref)); };
          raw.removeLabel = function(id)  { _t(); return _raw.removeLabel(this.id, id); };
          raw.setCustomField = function(key, val) { _t(); return _wrapCard(_data(_raw.setCustomField(this.id, key, val))); };
          raw.getCustomField = function(key) {
            _t();
            const r = _raw.getCustomField(this.id, key);
            return (r && r.ok) ? r.data.value : null;
          };
          raw.relevantCustomFields = function() {
            _t();
            return _data(_raw.getRelevantCustomFields(this.id)) || [];
          };
          raw.incrementCustomField = function(key, delta) {
            _t();
            const r = _raw.incrementCustomField(this.id, key, delta == null ? 1 : delta);
            return (r && r.ok) ? r.data.value : null;
          };
          raw.getCustomFieldNumber = function(key) {
            _t();
            const r = _raw.getCustomFieldNumber(this.id, key);
            return (r && r.ok) ? r.data.value : 0;
          };
          raw.addChecklist = function(name) { _t(); return _wrapChecklist(_data(_raw.addChecklist(this.id, name))); };
          raw.checklists   = function() { _t(); return (_data(_raw.listChecklists(this.id)) || []).map(_wrapChecklist); };
          raw.addComment = function(body) { _t(); return _data(_raw.addComment(this.id, body)); };
          raw.comments   = function(limit) { _t(); return _data(_raw.listComments(this.id, limit)) || []; };
          raw.refresh    = function() { _t(); return _wrapCard(_data(_raw.getCard(this.id))); };
          return raw;
        }

        function _wrapColumn(raw, boardRef) {
          if (!raw) return raw;
          raw._boardRef = boardRef;
          raw.cards = function(filters) {
            _t();
            const f = Object.assign({}, filters || {}, { column_id: this.id });
            return (_data(_raw.listCards(this._boardRef, f)) || []).map(_wrapCard);
          };
          raw.createCard = function(attrs) {
            _t();
            return _wrapCard(_data(_raw.createCard(this._boardRef, this.id, attrs || {})));
          };
          return raw;
        }

        function _wrapBoard(raw) {
          if (!raw) return raw;
          if (Array.isArray(raw.columns)) raw.columns = raw.columns.map(c => _wrapColumn(c, raw.id));
          // O id agora é texto, como o nome: procura o id primeiro. Na origem, texto era só nome.
          raw.column = function(ref) {
            const columns = this.columns || [];
            const byId = columns.find(c => String(c.id) === String(ref));
            if (byId) return byId;
            const wanted = _norm(ref);
            return columns.find(c => _norm(c.name) === wanted);
          };
          raw.cards = function(filters) {
            _t();
            return (_data(_raw.listCards(this.id, filters || {})) || []).map(_wrapCard);
          };
          raw.cardsForConversation = function() {
            _t();
            return (_data(_raw.listCards(this.id, {})) || []).map(_wrapCard);
          };
          raw.createCard = function(columnRef, attrs) {
            _t();
            const col = this.column(columnRef);
            if (!col) return { ok: false, error: 'column_not_found: ' + columnRef };
            return _wrapCard(_data(_raw.createCard(this.id, col.id, attrs || {})));
          };
          raw.customFields = function() { _t(); return _data(_raw.getCustomFields(this.id)) || []; };
          raw.refresh      = function() { _t(); return _wrapBoard(_data(_raw.getBoard(this.id))); };
          return raw;
        }

        kanban.boards = function() {
          _t();
          return (_data(_raw.listBoards()) || []).map(_wrapBoard);
        };

        kanban.board = function(ref) {
          _t();
          return _wrapBoard(_data(_raw.getBoard(ref)));
        };

        kanban.card = function(id) {
          _t();
          return _wrapCard(_data(_raw.getCard(id)));
        };

        kanban.cardsForConversation = function() {
          _t();
          return (_data(_raw.findCardsForConversation()) || []).map(_wrapCard);
        };

        kanban.labels = function() {
          _t();
          return _data(_raw.listLabels()) || [];
        };
      })();
    JS

    # Operações que os blocos `kanban_*` dos fluxos chamam fora do V8. O mesmo código das funções JS,
    # então valem as mesmas regras: travas de checklist e campos, `DealCloseGate`.
    FLOW_OPERATIONS = %i[
      create_card get_card update_card move_card archive_card
      mark_won mark_lost reopen_deal add_label remove_label
      assign_custom_field add_comment add_checklist add_checklist_item
    ].freeze

    # Entrada direta, sem V8: `worker` dá o contexto (:organization, :chat) e `args` são os mesmos
    # parâmetros posicionais da função JS. Devolve `{ ok:, data: | error: }`, com chave símbolo.
    def call_operation(worker, operation, *args)
      raise ArgumentError, "unsupported kanban operation: #{operation}" unless FLOW_OPERATIONS.include?(operation.to_sym)

      @worker = worker
      send(operation, args)
    end

    def register(worker, context, event)
      @worker = worker

      attach(context, event, "kanban.listBoards", :list_boards)
      attach(context, event, "kanban.getBoard", :get_board)
      attach(context, event, "kanban.listColumns", :list_columns)
      attach(context, event, "kanban.listCards", :list_cards)
      attach(context, event, "kanban.findCardsForConversation", :find_cards_for_conversation)
      attach(context, event, "kanban.listLabels", :list_labels)

      attach(context, event, "kanban.createCard", :create_card)
      attach(context, event, "kanban.getCard", :get_card)
      attach(context, event, "kanban.updateCard", :update_card)
      attach(context, event, "kanban.moveCard", :move_card)
      attach(context, event, "kanban.archiveCard", :archive_card)

      attach(context, event, "kanban.markWon", :mark_won)
      attach(context, event, "kanban.markLost", :mark_lost)
      attach(context, event, "kanban.reopenDeal", :reopen_deal)

      attach(context, event, "kanban.addLabel", :add_label)
      attach(context, event, "kanban.removeLabel", :remove_label)

      attach(context, event, "kanban.setCustomField", :assign_custom_field)
      attach(context, event, "kanban.getCustomField", :read_custom_field)
      attach(context, event, "kanban.getCustomFields", :get_custom_fields)
      attach(context, event, "kanban.getRelevantCustomFields", :get_relevant_custom_fields)
      attach(context, event, "kanban.incrementCustomField", :increment_custom_field)
      attach(context, event, "kanban.getCustomFieldNumber", :get_custom_field_number)

      attach(context, event, "kanban.addChecklist", :add_checklist)
      attach(context, event, "kanban.addChecklistItem", :add_checklist_item)
      attach(context, event, "kanban.toggleChecklistItem", :toggle_checklist_item)
      attach(context, event, "kanban.listChecklists", :list_checklists)

      attach(context, event, "kanban.addComment", :add_comment)
      attach(context, event, "kanban.listComments", :list_comments)
    end

    def bootstrap_js
      BOOTSTRAP_JS
    end

    private

    def attach(context, event, js_name, method_name)
      target = method(method_name)
      context.attach(js_name, proc { |*params| attach_method(target, params, event) })
    end

    # ── Descoberta ─────────────────────────────────────────────────────────

    def list_boards(_params)
      safe do
        cached = @worker.get_context(:kanban_boards_index)
        next { ok: true, data: cached } if cached

        data = boards.active.ordered.includes(:stages).map { |board| Payloads.board_summary(board) }
        @worker.set_context(:kanban_boards_index, data)
        { ok: true, data: data }
      end
    end

    def get_board(params)
      safe { { ok: true, data: Payloads.board_detail(find_board(params[0])) } }
    end

    def list_columns(params)
      safe { { ok: true, data: find_board(params[0]).stages.map { |stage| Payloads.column(stage) } } }
    end

    def list_cards(params)
      safe do
        board_ref, filters = params
        filters = (filters.is_a?(Hash) ? filters : {}).deep_stringify_keys
        scope = find_board(board_ref).cards.includes(:labels, :stage)
        scope = scope.active unless filters["archived"]
        scope = filters["allConversations"] ? scope : by_current_chat(scope)
        scope = filter_by_id(scope, :stage_id, filters["column_id"]) if filters["column_id"].present?
        scope = scope.by_priority(filters["priority"]) if filters["priority"].present?
        scope = filter_by_id(scope, :assigned_to_id, filters["assigned_to_id"]) if filters["assigned_to_id"].present?
        scope = scope.by_tags(filters["tags"]) if filters["tags"].present?
        scope = scope.search_by_title(filters["search"].to_s) if filters["search"].present?
        scope = scope.overdue if filters["overdue"] == true
        { ok: true, data: scope.limit(MAX_LISTED_CARDS).map { |card| Payloads.card(card) } }
      end
    end

    def find_cards_for_conversation(_params)
      safe do
        scope = by_current_chat(cards_of_organization.active).includes(:labels, :stage)
        { ok: true, data: scope.limit(MAX_LISTED_CARDS).map { |card| Payloads.card(card) } }
      end
    end

    def list_labels(_params)
      safe { { ok: true, data: labels.ordered.map { |label| Payloads.label(label) } } }
    end

    # ── Card ───────────────────────────────────────────────────────────────

    def create_card(params)
      safe do
        board_ref, column_ref, attributes = params
        attributes = (attributes.is_a?(Hash) ? attributes : {}).deep_stringify_keys
        link_chat = attributes.fetch("linkConversation", true) != false

        board = find_board(board_ref)
        stage = find_column(board, column_ref)
        fields = filtered_card_attrs(attributes, CREATE_WHITELIST).merge(suppress_trigger_evaluation: suppress_triggers?)

        card = if link_chat && chat
          ::Pipelines::CardCreatorFromChat.call(chat: chat, board: board, stage: stage, attributes: fields)
        else
          stage.cards.create!(fields)
        end

        { ok: true, data: Payloads.card(card.reload) }
      end
    end

    def get_card(params)
      safe { { ok: true, data: Payloads.card(find_card(params[0])) } }
    end

    def update_card(params)
      safe do
        card_id, attributes = params
        card = find_card(card_id)
        card.update!(filtered_card_attrs((attributes.is_a?(Hash) ? attributes : {}).deep_stringify_keys, UPDATE_WHITELIST))
        { ok: true, data: Payloads.card(card.reload) }
      end
    end

    def move_card(params)
      safe do
        card_id, column_ref, at_end = params
        card = find_card(card_id)
        stage = find_column(card.stage.board, column_ref)

        result = ::Pipelines::MoveCard.call(card: card, stage: stage, at: at_end ? :bottom : :top)
        next move_blocked(result) unless result.moved?

        { ok: true, data: Payloads.card(card.reload) }
      end
    end

    def move_blocked(result)
      blocked = { ok: false, error: result.error.to_s }
      blocked[:pending_items] = result.pending_items if result.pending_items
      blocked[:pending_fields] = result.pending_fields if result.pending_fields
      blocked
    end

    def archive_card(params)
      safe do
        card_id, undo = params
        card = find_card(card_id)
        undo ? card.update!(archived: false) : card.archive!
        { ok: true, data: Payloads.card(card.reload) }
      end
    end

    # ── Negócio ────────────────────────────────────────────────────────────

    def mark_won(params)
      safe do
        card = find_card(params[0])
        gate = ::Pipelines::DealCloseGate.new(card, :won).call
        next deal_close_blocked(gate) unless gate.allowed?

        card.mark_won!
        { ok: true, data: Payloads.card(card.reload) }
      end
    end

    def mark_lost(params)
      safe do
        card_id, reason = params
        card = find_card(card_id)
        gate = ::Pipelines::DealCloseGate.new(card, :lost).call
        next deal_close_blocked(gate) unless gate.allowed?

        card.mark_lost!(reason)
        { ok: true, data: Payloads.card(card.reload) }
      end
    end

    def deal_close_blocked(gate)
      {
        ok: false,
        error: "required_fields_incomplete",
        pending_fields: gate.pending_fields,
        pending_field_keys: gate.pending_field_keys
      }
    end

    def reopen_deal(params)
      safe do
        card = find_card(params[0])
        card.reopen_deal!
        { ok: true, data: Payloads.card(card.reload) }
      end
    end

    # ── Etiquetas ──────────────────────────────────────────────────────────

    def add_label(params)
      safe do
        card_id, label_ref = params
        card = find_card(card_id)
        label = resolve_label(label_ref)
        attach_label(card, label)
        card.broadcast_progress_change
        { ok: true, data: Payloads.label(label) }
      end
    end

    # Idempotente: anexar a mesma etiqueta duas vezes, mesmo ao mesmo tempo, não duplica nem é erro.
    def attach_label(card, label)
      ::Pipelines::CardLabel.find_or_create_by!(card_id: card.id, label_id: label.id)
    rescue ActiveRecord::RecordNotUnique
      nil
    end

    def remove_label(params)
      safe do
        card_id, label_id = params
        card = find_card(card_id)
        card.card_labels.where(label_id: label_id).destroy_all if ::Pipelines.uuid?(label_id)
        card.broadcast_progress_change
        { ok: true }
      end
    end

    # O id agora é texto, como o nome. Sem olhar o formato primeiro, passar o id de uma etiqueta
    # existente criaria outra etiqueta com um UUID por nome.
    def resolve_label(reference)
      not_found!("Label '#{reference}' not found") unless reference.is_a?(String) && reference.present?

      if ::Pipelines.uuid?(reference)
        return labels.find_by(id: reference) || not_found!("Label '#{reference}' not found")
      end

      existing = labels.find_by("LOWER(name) = ?", reference.squish.downcase)
      existing || labels.create!(name: reference, color: ::Pipelines::Label::AUTOMATION_COLOR)
    rescue ActiveRecord::RecordNotUnique
      labels.find_by!("LOWER(name) = ?", reference.squish.downcase)
    end

    # ── Campos personalizados ──────────────────────────────────────────────

    def assign_custom_field(params)
      safe do
        card_id, key, value = params
        card = find_card(card_id)
        definition = resolve_custom_field(card.stage.board, key)
        final_key, final_value = resolve_custom_field_assignment(definition, key, value)

        card.set_custom_field_value(final_key, final_value)
        card.save!
        { ok: true, data: Payloads.card(card.reload), resolved: { key: final_key, value: final_value } }
      end
    end

    def get_custom_fields(params)
      safe do
        board = find_board(params[0])
        { ok: true, data: board.custom_fields.map { |field| Payloads.custom_field_definition(field) } }
      end
    end

    # Os campos do quadro mais os da etapa atual do card: o que importa para a etapa onde ele está.
    def get_relevant_custom_fields(params)
      safe do
        card = find_card(params[0])
        relevant = card.stage.board.custom_fields
                       .where("scope = 'board' OR (scope = 'stage' AND stage_id = ?)", card.stage_id)
                       .reorder(:scope, :position)
        { ok: true, data: relevant.map { |field| Payloads.custom_field_definition(field) } }
      end
    end

    def read_custom_field(params)
      safe do
        card_id, key = params
        card = find_card(card_id)
        definition = resolve_custom_field(card.stage.board, key)
        lookup_key = definition&.key || key.to_s
        { ok: true, data: { key: lookup_key, value: card.custom_field_value(lookup_key) } }
      end
    end

    # Comando único no Postgres, sem ler e salvar: dois sinais ao mesmo tempo não se perdem. Por não
    # passar por callback, transmite à mão. O valor que não é número conta como 0, e não vira erro de
    # conversão no banco.
    def increment_custom_field(params)
      safe do
        card_id, key, delta = params
        amount = (delta || 1).to_f
        card = find_card(card_id)
        definition = resolve_custom_field(card.stage.board, key)
        final_key = definition&.key || key.to_s

        sql = <<~SQL.squish
          UPDATE pipeline_cards
          SET custom_field_values = jsonb_set(
            custom_field_values,
            ARRAY[?]::text[],
            to_jsonb(CASE WHEN custom_field_values->>? ~ ? THEN (custom_field_values->>?)::numeric ELSE 0 END + ?)
          )
          WHERE id = ?
          RETURNING (custom_field_values->>?)::numeric AS new_value
        SQL
        result = ::Pipelines::Card.lease_connection.exec_query(
          ::Pipelines::Card.sanitize_sql_array([ sql, final_key, final_key, NUMERIC_TEXT, final_key, amount, card.id, final_key ])
        )

        card.reload.broadcast_progress_change

        { ok: true, data: { key: final_key, value: result.rows.dig(0, 0)&.to_f } }
      end
    end

    # Como número, com 0 quando ausente ou inválido: regra de pontuação soma sinais sem tratar nil.
    def get_custom_field_number(params)
      safe do
        card_id, key = params
        card = find_card(card_id)
        definition = resolve_custom_field(card.stage.board, key)
        lookup_key = definition&.key || key.to_s
        raw = card.custom_field_value(lookup_key)
        number = raw.is_a?(Numeric) ? raw.to_f : (Float(raw, exception: false) || 0.0)
        { ok: true, data: { key: lookup_key, value: number } }
      end
    end

    # ── Checklists ─────────────────────────────────────────────────────────

    def add_checklist(params)
      safe do
        card_id, name = params
        card = find_card(card_id)
        checklist = card.checklists.find_by("LOWER(name) = ?", name.to_s.downcase) || card.checklists.create!(name: name)
        { ok: true, data: Payloads.checklist(checklist) }
      end
    end

    def add_checklist_item(params)
      safe do
        checklist_id, title = params
        checklist = find_checklist(checklist_id)
        item = checklist.items.find_by("LOWER(title) = ?", title.to_s.downcase) || checklist.items.create!(title: title)
        { ok: true, data: Payloads.checklist_item(item) }
      end
    end

    def toggle_checklist_item(params)
      safe do
        item = find_checklist_item(params[0])
        item.toggle!
        { ok: true, data: Payloads.checklist_item(item) }
      end
    end

    def list_checklists(params)
      safe do
        card = find_card(params[0])
        { ok: true, data: card.checklists.includes(:items).map { |checklist| Payloads.checklist(checklist) } }
      end
    end

    # ── Comentários ────────────────────────────────────────────────────────

    # Na origem, o autor era o assistente da conversa. Aqui, a automação: quem lê vê "Automação" no
    # lugar do nome de alguém que não escreveu aquilo.
    def add_comment(params)
      safe do
        card_id, body = params
        card = find_card(card_id)
        comment = card.comments.create!(body: body, automation_source: @worker.get_context(COMMENT_SOURCE_KEY) || "script")
        { ok: true, data: Payloads.comment(comment) }
      end
    end

    def list_comments(params)
      safe do
        card_id, limit = params
        limit = (limit.is_a?(Numeric) ? limit.to_i : 20).clamp(1, 100)
        card = find_card(card_id)
        comments = card.comments.roots.includes(:author).order(created_at: :desc).limit(limit)
        { ok: true, data: comments.map { |comment| Payloads.comment(comment) } }
      end
    end

    # ── Apoio ──────────────────────────────────────────────────────────────

    def chat_id_text
      chat&.id&.to_s
    end

    # Sem conversa no contexto (gatilho de card sem contato), "os cards do lead" é nada. `where(chat_id: nil)`
    # devolveria todos os cards sem conversa da organização.
    def by_current_chat(scope)
      chat ? scope.by_chat(chat_id_text) : scope.none
    end

    # `where(coluna_uuid: "abc")` vira `IS NULL`, porque o Active Record converte o inválido para nil.
    def filter_by_id(scope, column, value)
      ::Pipelines.uuid?(value) ? scope.where(column => value) : scope.none
    end

    def boards
      require_organization!.pipeline_boards
    end

    def labels
      require_organization!.pipeline_labels
    end

    def cards_of_organization
      ::Pipelines::Card.where(organization_id: require_organization!.id)
    end

    def suppress_triggers?
      @worker.get_context(SUPPRESS_TRIGGERS_KEY) == true
    end

    def not_found!(message)
      raise ActiveRecord::RecordNotFound, message
    end

    # Pelo id ou pelo nome, sem ligar para caixa e acento.
    def find_board(reference)
      find_by_reference(boards, reference) || not_found!("Board '#{reference}' not found")
    end

    def find_column(board, reference)
      find_by_reference(board.stages, reference) || not_found!("Column '#{reference}' not found in board '#{board.name}'")
    end

    def find_by_reference(scope, reference)
      return nil unless reference.is_a?(String) && reference.present?
      return scope.find_by(id: reference) if ::Pipelines.uuid?(reference)

      wanted = normalize_name(reference)
      scope.detect { |record| normalize_name(record.name) == wanted }
    end

    def normalize_name(text)
      I18n.transliterate(text.to_s, replacement: "?").strip.downcase
    end

    def find_card(id)
      card = ::Pipelines.uuid?(id) ? cards_of_organization.find_by(id: id) : nil
      not_found!("Card '#{id}' not found") unless card

      card.suppress_trigger_evaluation = true if suppress_triggers?
      card
    end

    def find_checklist(id)
      checklist = ::Pipelines.uuid?(id) ? ::Pipelines::Checklist.joins(:card).find_by(id: id, pipeline_cards: { organization_id: require_organization!.id }) : nil
      checklist || not_found!("Checklist '#{id}' not found")
    end

    def find_checklist_item(id)
      item = if ::Pipelines.uuid?(id)
        ::Pipelines::ChecklistItem.joins(checklist: :card).find_by(id: id, pipeline_cards: { organization_id: require_organization!.id })
      end
      item || not_found!("Checklist item '#{id}' not found")
    end

    def filtered_card_attrs(attributes, whitelist)
      attributes.slice(*whitelist.map(&:to_s)).transform_keys(&:to_sym)
    end

    # Resolve uma referência ("Qualificação", "qualificacao", "_qualificação") contra os campos do
    # quadro. Nesta ordem: `key` exata, `key` depois de normalizar, `name` sem caixa, `name` sem
    # acento e, por último, tolerante a separadores nas pontas.
    def resolve_custom_field(board, reference)
      return nil if reference.nil? || reference.to_s.empty?

      text = reference.to_s
      normalized = text.parameterize.underscore
      stripped = normalized.gsub(/\A_+|_+\z/, "")
      definitions = board.custom_fields.to_a

      definitions.find { |field| field.key == text } ||
        definitions.find { |field| field.key == normalized } ||
        definitions.find { |field| field.name.to_s.casecmp(text).zero? } ||
        definitions.find { |field| field.name.to_s.parameterize.underscore == normalized } ||
        definitions.find { |field| field.key.to_s.gsub(/\A_+|_+\z/, "") == stripped } ||
        definitions.find { |field| field.name.to_s.parameterize.underscore.gsub(/\A_+|_+\z/, "") == stripped }
    end

    # Qual chave gravar e, no campo `select`, qual opção. Sem definição, mantém a chave como veio: é o
    # campo avulso, que a origem aceitava.
    def resolve_custom_field_assignment(definition, raw_key, value)
      return [ raw_key.to_s, value ] if definition.nil?

      final_value = definition.select? && definition.options.present? ? closest_select_option(definition.options, value) : value

      [ definition.key, final_value ]
    end

    # Casa o valor com as opções do `select`, sem caixa e sem acento. Sem opção que case, devolve como
    # veio, para quem chamou poder notar e tentar de novo.
    def closest_select_option(options, value)
      return value if value.nil?

      wanted = value.to_s.parameterize
      Array(options).map(&:to_s).find { |option| option.parameterize == wanted } || value
    end

    # Erro de domínio volta no retorno, e o script decide o que fazer. Só `MiniRacerEngine::Error` (cota,
    # falta de contexto) segue como exceção; o resto é detalhe interno e fica no log.
    def safe
      yield
    rescue ActiveRecord::RecordNotFound => e
      { ok: false, error: "not_found: #{e.message}" }
    rescue ActiveRecord::RecordInvalid => e
      { ok: false, error: e.record.errors.full_messages.join(", ") }
    rescue MiniRacerEngine::Error, ::MiniRacer::Error
      raise
    rescue StandardError => e
      Rails.logger.error("[MiniRacerEngine::Workers::Kanban] #{e.class}: #{e.message}\n#{Array(e.backtrace).first(8).join("\n")}")
      { ok: false, error: "internal_error" }
    end
  end
end
