module FlowRuntime
  # As ferramentas do próprio Vekoo que o bloco "Conversa com IA" oferece ao modelo, sem JavaScript: rodam em Ruby, no
  # processo que já está executando o fluxo, sobre os mesmos serviços das telas e das funções `appointment.*`, `catalog.*`
  # e `kanban.*` (Agenda::BookingService, Products::SearchService, Pipelines::Automation).
  #
  # O bloco escolhe grupos (`native_tools: ["agenda", "catalog"]`), e não funções soltas: quem desenha o fluxo pensa em "a IA
  # pode marcar horário", e não em seis funções. Tudo fica dentro da organização do fluxo e da conversa atual: card, horário
  # e etiqueta de outro contato não existem para o modelo, mesmo que ele invente um id.
  #
  # No teste do editor, o que mexe em agenda e pipeline não acontece: a ferramenta responde como se tivesse feito, com
  # `simulated: true`, e o teste mostra isso. Etiqueta e campo valem na conversa de teste, que não aparece em lista nenhuma.
  #
  # O retorno é sempre um Hash pequeno em JSON. Erro volta como `{ error: "..." }`, em inglês e curto, para o modelo
  # conseguir se corrigir ou explicar ao contato. Nada aqui levanta para o motor.
  class NativeTools
    GROUPS = %w[agenda catalog contact tags pipeline].freeze
    SIMULATED_IN_TEST = %w[agenda_create_booking agenda_cancel_booking pipeline_create_card pipeline_move_card].freeze
    MAX_LIST = 30
    MAX_CATALOG = 10

    Definition = Struct.new(:name, :group, :description, :properties, :required, keyword_init: true) do
      def input_schema
        { "type" => "object", "properties" => properties || {}, "required" => required || [] }
      end
    end

    # Uma ferramenta pronta para o laço de `Llm#converse`, com a mesma cara de `ToolFunction::MiniRacer`.
    class Tool
      attr_reader :definition

      delegate :name, :group, :description, :input_schema, to: :definition

      def initialize(definition, owner)
        @definition = definition
        @owner = owner
      end

      def native?
        true
      end

      def invoke(input, **)
        @owner.run(name, input)
      end
    end

    def self.string(description) = { "type" => "string", "description" => description }

    DEFINITIONS = [
      Definition.new(name: "agenda_list_services", group: "agenda",
                     description: "List the services that can be booked, with duration in minutes and description."),
      Definition.new(name: "agenda_list_professionals", group: "agenda",
                     description: "List the professionals and which services each one performs."),
      Definition.new(name: "agenda_available_slots", group: "agenda",
                     description: "Free time slots for a service, grouped by day, in the calendar time zone. Always check before offering a time.",
                     properties: {
                       "service_name" => string("Exact service name, from agenda_list_services"),
                       "date_start" => string("First day to look at, YYYY-MM-DD"),
                       "date_end" => string("Last day to look at, YYYY-MM-DD. Optional, defaults to date_start"),
                       "professional_name" => string("Optional: only this professional")
                     },
                     required: %w[service_name date_start]),
      Definition.new(name: "agenda_create_booking", group: "agenda",
                     description: "Book a time for this contact. Only after the contact confirmed service, professional, day and time.",
                     properties: {
                       "service_name" => string("Exact service name"),
                       "professional_name" => string("Exact professional name"),
                       "start_time" => string("Start, YYYY-MM-DD HH:MM, in the calendar time zone")
                     },
                     required: %w[service_name professional_name start_time]),
      Definition.new(name: "agenda_list_bookings", group: "agenda",
                     description: "Upcoming bookings of this contact."),
      Definition.new(name: "agenda_cancel_booking", group: "agenda",
                     description: "Cancel one of this contact's upcoming bookings, after the contact asked for it.",
                     properties: { "booking_id" => string("Id from agenda_list_bookings") },
                     required: %w[booking_id]),

      Definition.new(name: "catalog_search", group: "catalog",
                     description: "Search the product and service catalog by meaning. Returns title, summary, price-like fields, link and image.",
                     properties: {
                       "query" => string("What the contact is looking for, in their words"),
                       "category" => string("Optional category path, from catalog_categories"),
                       "limit" => { "type" => "integer", "description" => "How many items, 1 to #{MAX_CATALOG}. Default 5" }
                     },
                     required: %w[query]),
      Definition.new(name: "catalog_get_item", group: "catalog",
                     description: "Full details of one catalog item, including the description.",
                     properties: { "item" => string("Item id or SKU, from catalog_search") },
                     required: %w[item]),
      Definition.new(name: "catalog_categories", group: "catalog",
                     description: "The catalog categories, with how many items each has."),

      Definition.new(name: "contact_get", group: "contact",
                     description: "What is known about this contact: name, phone, saved fields and tags."),
      Definition.new(name: "contact_update", group: "contact",
                     description: "Save the contact's name or saved fields. Only fields listed by contact_get under available_fields.",
                     properties: {
                       "name" => string("Full name, only when the contact said it"),
                       "fields" => { "type" => "object", "description" => "Field key to value, as text", "additionalProperties" => { "type" => "string" } }
                     }),

      Definition.new(name: "tags_list", group: "tags",
                     description: "Tags this organization uses, with what each one means, and the ones this contact has."),
      Definition.new(name: "tag_add", group: "tags",
                     description: "Put an existing tag on this contact.",
                     properties: { "name" => string("Tag name, from tags_list") }, required: %w[name]),
      Definition.new(name: "tag_remove", group: "tags",
                     description: "Take a tag off this contact.",
                     properties: { "name" => string("Tag name") }, required: %w[name]),

      Definition.new(name: "pipeline_list_boards", group: "pipeline",
                     description: "Pipelines (boards) and their stages, in order."),
      Definition.new(name: "pipeline_list_cards", group: "pipeline",
                     description: "Cards linked to this contact, with pipeline, stage and status."),
      Definition.new(name: "pipeline_create_card", group: "pipeline",
                     description: "Create a card for this contact in a pipeline.",
                     properties: {
                       "board" => string("Pipeline name, from pipeline_list_boards"),
                       "stage" => string("Stage name. Optional, defaults to the first stage"),
                       "title" => string("Short card title"),
                       "description" => string("Optional details"),
                       "deal_value" => { "type" => "number", "description" => "Optional value in the organization currency" }
                     },
                     required: %w[board title]),
      Definition.new(name: "pipeline_move_card", group: "pipeline",
                     description: "Move one of this contact's cards to another stage of the same pipeline.",
                     properties: { "card_id" => string("Id from pipeline_list_cards"), "stage" => string("Stage name") },
                     required: %w[card_id stage])
    ].freeze

    # Os grupos que o bloco pode oferecer, e se a organização tem com o que usar cada um.
    #
    # @return [Array<Hash>] `{ key:, available:, tools: [nome] }`
    def self.availability(organization)
      GROUPS.map do |group|
        { key: group, available: available?(group, organization), tools: DEFINITIONS.select { |item| item.group == group }.map(&:name) }
      end
    end

    def self.available?(group, organization)
      case group
      when "agenda" then ::Agenda::Calendar.default_for(organization.id).present?
      when "catalog" then ::Products::Item.for_organization(organization.id).exists?
      when "pipeline" then ::Pipelines::Board.where(organization_id: organization.id).active.exists?
      else true
      end
    end

    def self.normalize(groups)
      Array(groups).map(&:to_s) & GROUPS
    end

    def initialize(organization:, chat:, groups:, playground: false)
      @organization = organization
      @chat = chat
      @groups = self.class.normalize(groups)
      @playground = playground
    end

    def tools
      @tools ||= @groups.select { |group| self.class.available?(group, @organization) }
                        .flat_map { |group| DEFINITIONS.select { |item| item.group == group } }
                        .map { |definition| Tool.new(definition, self) }
    end

    def any?
      tools.any?
    end

    def agenda?
      tools.any? { |tool| tool.group == "agenda" }
    end

    # "Agora" no fuso do calendário: sem isto o modelo não sabe que dia é amanhã.
    def agenda_clock
      calendar = ::Agenda::Calendar.default_for(@organization.id)
      return nil unless calendar

      now = Time.current.in_time_zone(calendar.zone)
      "Now in the calendar time zone (#{calendar.zone.tzinfo.name}): #{now.strftime('%A, %Y-%m-%d %H:%M')}."
    end

    # O que não depende de saber quem é o contato.
    WITHOUT_CHAT = %w[agenda_list_services agenda_list_professionals agenda_available_slots catalog_search catalog_get_item
                      catalog_categories pipeline_list_boards tags_list].freeze

    # @return [Hash]
    def run(name, input)
      name = name.to_s
      return { error: "Unknown tool #{name}" } unless tools.any? { |tool| tool.name == name }

      input = input.to_h.stringify_keys
      return simulated(input) if @playground && SIMULATED_IN_TEST.include?(name)
      return { error: "This tool needs a conversation" } if chat.nil? && !WITHOUT_CHAT.include?(name)

      send("run_#{name}", input)
    rescue MiniRacerEngine::Error, ArgumentError => e
      { error: e.message.truncate(300) }
    end

    private

    attr_reader :organization, :chat

    def simulated(input)
      { ok: true, simulated: true, note: "Test run: nothing was changed. Answer as if it was done.", received: input }
    end

    # ---------- agenda ----------

    def booking_service
      @booking_service ||= begin
        calendar = ::Agenda::Calendar.default_for(organization.id)
        raise ArgumentError, "No calendar in this organization" unless calendar

        ::Agenda::BookingService.new(calendar, chat: chat)
      end
    end

    def run_agenda_list_services(_input)
      list = booking_service.list_services
      list.is_a?(Array) ? { services: list.first(MAX_LIST).map { |item| item.slice("service_name", "duration", "description") } } : list
    end

    def run_agenda_list_professionals(_input)
      list = booking_service.list_professionals
      list.is_a?(Array) ? { professionals: list.first(MAX_LIST).map { |item| { name: item["name"], services: item["list_of_allowed_services_of_this_employee"] } } } : list
    end

    def run_agenda_available_slots(input)
      result = booking_service.available_slots(
        service_name: input["service_name"].to_s,
        date_start: input["date_start"].to_s,
        date_end: input["date_end"].presence || input["date_start"].to_s,
        employee_name: input["professional_name"].presence,
        time_fallback: true
      )
      result.is_a?(Hash) ? result.except(:employee_with_priority, "employee_with_priority") : result
    end

    def run_agenda_create_booking(input)
      booking_service.create_booking(
        employee_name: input["professional_name"].to_s,
        service_name: input["service_name"].to_s,
        start_time: input["start_time"].to_s
      ).slice(:success, :message, :booking_id, :error, :service_duration, :message_instruction, :next_available_slots, :employees_can_perform_this_service)
    end

    def run_agenda_list_bookings(_input)
      { bookings: booking_service.list_bookings }
    end

    # Só um horário DESTE contato: o serviço da agenda aceita qualquer horário do calendário.
    def run_agenda_cancel_booking(input)
      booking = chat.bookings.active.where(id: input["booking_id"].to_s).take
      return { error: "Booking not found among this contact's bookings" } unless booking

      booking_service.cancel_booking(booking_id: booking.id)
    end

    # ---------- catálogo ----------

    def run_catalog_search(input)
      limit = input["limit"].to_i.positive? ? [ input["limit"].to_i, MAX_CATALOG ].min : 5
      filters = { categories: Array(input["category"].presence) }.compact_blank
      result = ::Products::SearchService.new(organization.id, query: input["query"].to_s.first(1_000), filters: filters, limit: limit).call
      { total: result.total, items: result.items.map { |item| catalog_item(item) } }
    end

    def run_catalog_get_item(input)
      reference = input["item"].to_s
      scope = ::Products::Item.for_organization(organization.id).listable
      item = scope.find_by(external_id: reference) || (scope.find_by(id: reference) if reference.match?(MiniRacerEngine::Workers::Catalog::UUID))
      return { error: "Item not found" } unless item

      catalog_item(item, full: true)
    end

    def run_catalog_categories(_input)
      { categories: ::Products::Category.for_organization(organization.id).order(:path).limit(MAX_LIST).pluck(:path, :items_count).map { |path, count| { path: path, items: count } } }
    end

    def catalog_item(item, full: false)
      images = item.images.to_a
      payload = {
        id: item.id,
        sku: (item.external_id unless item.external_id.to_s.start_with?(::Products::Item::AUTO_KEY_PREFIX)),
        title: item.title,
        summary: item.summary,
        fields: item.custom_fields,
        url: item.url,
        image: images.first&.delivery_url
      }.compact
      payload[:description] = item.description.to_s.truncate(2_000) if full
      payload
    end

    # ---------- contato ----------

    def run_contact_get(_input)
      definitions = CustomField.where(organization_id: organization.id.to_s).limit(MAX_LIST).to_a
      values = chat.custom_attributes.to_h
      {
        name: chat.user_name,
        phone: chat.phone_number,
        fields: definitions.filter_map { |field| [ field.key, { label: field.name, value: values[field.key] } ] if values[field.key].present? }.to_h,
        available_fields: definitions.map { |field| { key: field.key, label: field.name, description: field.description }.compact },
        tags: tags_on_chat.map(&:name)
      }
    end

    def run_contact_update(input)
      allowed = CustomField.where(organization_id: organization.id.to_s).pluck(:key)
      fields = input["fields"].is_a?(Hash) ? input["fields"].transform_keys(&:to_s) : {}
      unknown = fields.keys - allowed
      return { error: "Unknown fields: #{unknown.join(', ')}", available_fields: allowed } if unknown.any?

      changes = {}
      changes[:user_name] = input["name"].to_s.squish.first(120) if input["name"].present?
      changes[:custom_attributes] = chat.custom_attributes.to_h.merge(fields.transform_values { |value| value.to_s.first(500) }) if fields.any?
      return { error: "Nothing to save" } if changes.empty?

      chat.update(changes)
      { ok: true, saved: changes.keys }
    end

    # ---------- etiquetas ----------

    def run_tags_list(_input)
      {
        available: ChatTag.where(organization_id: organization.id.to_s).limit(MAX_LIST).map { |tag| { name: tag.name, description: tag.description }.compact },
        on_contact: chat ? tags_on_chat.map(&:name) : []
      }
    end

    # Só etiqueta que já existe: o modelo não inventa a taxonomia da organização.
    def run_tag_add(input)
      tag = find_tag(input["name"])
      return { error: "Tag not found", available: ChatTag.where(organization_id: organization.id.to_s).limit(MAX_LIST).pluck(:name) } unless tag

      chat.add_to_set(chat_tag_ids: tag.id)
      chat.dispatch_event!
      { ok: true, tag: tag.name }
    end

    def run_tag_remove(input)
      tag = find_tag(input["name"])
      return { error: "Tag not found" } unless tag

      chat.pull(chat_tag_ids: tag.id)
      chat.dispatch_event!
      { ok: true, removed: tag.name }
    end

    def find_tag(name)
      ChatTag.where(organization_id: organization.id.to_s, name: name.to_s.parameterize.dasherize).take ||
        ChatTag.where(organization_id: organization.id.to_s, name: name.to_s).take
    end

    def tags_on_chat
      ChatTag.where(organization_id: organization.id.to_s, :_id.in => Array(chat.chat_tag_ids))
    end

    # ---------- pipeline ----------

    def run_pipeline_list_boards(_input)
      boards = ::Pipelines::Board.where(organization_id: organization.id).active.ordered.includes(:stages).limit(MAX_LIST)
      { boards: boards.map { |board| { name: board.name, stages: board.stages.sort_by(&:position).map(&:name) } } }
    end

    def run_pipeline_list_cards(_input)
      cards = own_cards.includes(stage: :board).reorder(created_at: :desc).limit(MAX_LIST)
      {
        cards: cards.map do |card|
          { id: card.id, title: card.title, board: card.stage&.board&.name, stage: card.stage&.name,
            status: card.won_at ? "won" : card.lost_at ? "lost" : "open", deal_value: card.deal_value&.to_f }.compact
        end
      }
    end

    def run_pipeline_create_card(input)
      board = find_board(input["board"])
      return { error: "Pipeline not found", available: ::Pipelines::Board.where(organization_id: organization.id).active.pluck(:name) } unless board

      stage = input["stage"].present? ? find_stage(board, input["stage"]) : board.stages.min_by(&:position)
      return { error: "Stage not found", available: board.stages.sort_by(&:position).map(&:name) } unless stage

      attrs = { "title" => input["title"].to_s.first(200), "description" => input["description"].to_s.first(2_000).presence, "deal_value" => input["deal_value"] }.compact
      result = ::Pipelines::Automation.call(:create_card, board.id, stage.id, attrs, organization: organization, chat: chat, source: "flow")
      result[:ok] ? { ok: true, card_id: result.dig(:data, :id), board: board.name, stage: stage.name } : { error: result[:error].to_s }
    end

    def run_pipeline_move_card(input)
      card = own_cards.where(id: input["card_id"].to_s).take
      return { error: "Card not found among this contact's cards" } unless card

      stage = find_stage(card.stage.board, input["stage"])
      return { error: "Stage not found", available: card.stage.board.stages.sort_by(&:position).map(&:name) } unless stage

      result = ::Pipelines::Automation.call(:move_card, card.id, stage.id, true, organization: organization, chat: chat, source: "flow")
      result[:ok] ? { ok: true, stage: stage.name } : { error: result[:error].to_s, pending_items: result[:pending_items] }.compact
    end

    def own_cards
      ::Pipelines::Card.active.where(organization_id: organization.id, chat_id: chat.id.to_s)
    end

    def find_board(reference)
      scope = ::Pipelines::Board.where(organization_id: organization.id).active
      scope.where("lower(name) = ?", reference.to_s.downcase.strip).first || (scope.find_by(id: reference) if uuid?(reference))
    end

    def find_stage(board, reference)
      board.stages.find { |stage| stage.name.casecmp?(reference.to_s.strip) } || board.stages.find { |stage| stage.id.to_s == reference.to_s }
    end

    def uuid?(value)
      value.to_s.match?(MiniRacerEngine::Workers::Catalog::UUID)
    end
  end
end
