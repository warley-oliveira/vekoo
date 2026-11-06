# Semente do domínio "inbox": o que a tela do chat e a de contatos usam, na organização da conta de
# demonstração, com a Doma Store. É obra do usuário fictício, não interface: fica em pt-BR mesmo
# quando a API responde em inglês.
#
# Roda depois de connectors.rb (a ordem é alfabética) e pendura nas conversas que já estão lá.
#
# Idempotente: cada registro é achado pela chave natural, e atributo que a pessoa mudou fica como
# está. Sem rede: os anexos são gerados aqui.
#
#   bin/rails runner 'load "db/seeds/inbox.rb"'

Object.send(:remove_const, :VekooInboxSeeds) if defined?(VekooInboxSeeds)

module VekooInboxSeeds
  DEMO_EMAIL = "marina.duarte@exemplo.com.br"

  CUSTOM_FIELDS = [
    { name: "Cidade", value_type: "text", description: "Onde o contato mora." },
    { name: "Tamanho preferido", value_type: "list", option_values: %w[PP P M G GG], description: "O tamanho que costuma levar." },
    { name: "Ticket médio", value_type: "number", auto_normalize: true, normalization_strategy: "avg", description: "Quanto costuma gastar por compra, em reais." },
    { name: "Aceita novidades", value_type: "checkbox", default_value: "true", description: "Topa receber lançamentos e promoções." },
    { name: "Aniversário", value_type: "date", description: "Para o cupom do mês." },
    { name: "Canal de origem", value_type: "list", option_values: [ "Instagram", "Indicação", "Loja física", "Site", "Google" ] }
  ].freeze

  # Por nome do contato. Valor de campo personalizado é sempre texto.
  ATTRIBUTES = {
    "Ana Beatriz Moura" => { "cidade" => "Londrina", "tamanho_preferido" => "M", "canal_de_origem" => "Instagram" },
    "João Pedro Almeida" => { "cidade" => "Curitiba", "tamanho_preferido" => "G", "ticket_medio" => "180", "aceita_novidades" => "true" },
    "Fernanda Lima" => { "cidade" => "Belo Horizonte", "ticket_medio" => "De R$ 400 a R$ 600", "canal_de_origem" => "Indicação", "aniversario" => "1989-03-14" },
    "Carlos Eduardo Santos" => { "cidade" => "São Paulo", "ticket_medio" => "950", "canal_de_origem" => "Google" },
    "Márcia Regina Costa" => { "cidade" => "Rio de Janeiro", "tamanho_preferido" => "P", "aceita_novidades" => "false" },
    "Lucas Oliveira" => { "cidade" => "Curitiba", "ticket_medio" => "230", "canal_de_origem" => "Loja física" },
    "Patrícia Gomes" => { "cidade" => "Belo Horizonte", "tamanho_preferido" => "GG", "ticket_medio" => "320" },
    "Roberto Nascimento" => { "cidade" => "Salvador", "ticket_medio" => "1200", "canal_de_origem" => "Site" },
    "Daniela Souza" => { "cidade" => "Fortaleza", "tamanho_preferido" => "M", "aceita_novidades" => "true", "aniversario" => "1994-11-21" }
  }.freeze

  EXTRA_TAGS = {
    "aguardando-operador" => [ "#f59e0b", "A automação passou para uma pessoa" ],
    "atacado" => [ "#4f46e5", "Compra para revender" ],
    "reclamacao" => [ "#b91c1c", "Precisa de atenção do pós-venda" ]
  }.freeze

  APPLIED_TAGS = {
    "Ana Beatriz Moura" => %w[aguardando-operador],
    "Carlos Eduardo Santos" => %w[atacado],
    "Roberto Nascimento" => %w[atacado],
    "Márcia Regina Costa" => %w[reclamacao aguardando-operador],
    "Patrícia Gomes" => %w[reclamacao]
  }.freeze

  # O texto cita o anexo pelo id: é assim que a mensagem rápida leva arquivo junto.
  QUICK_REPLIES = [
    { name: "Boas-vindas", trigger: "ola", content: "Oi! Aqui é da Doma Store. Como posso te ajudar hoje?" },
    { name: "Horário de atendimento", trigger: "horario", content: "Atendemos de segunda a sexta, das 9h às 18h, e aos sábados, das 9h às 13h." },
    { name: "Prazo de entrega", trigger: "prazo", content: "Para capitais do Sul e Sudeste, de 3 a 5 dias úteis. Para as demais regiões, de 6 a 10 dias úteis, a partir da confirmação do pagamento." },
    { name: "Troca e devolução", trigger: "troca", content: "Você tem até 30 dias para trocar, com a etiqueta na peça. A primeira troca é por nossa conta. É só me passar o número do pedido." },
    { name: "Dados do Pix", trigger: "pix", content: "Nosso Pix é o CNPJ 11.222.333/0001-81, em nome de Doma Store. Assim que pagar, me manda o comprovante por aqui?" },
    { name: "Tabela de preços", trigger: "tabela", attachment: "Tabela de preços de atacado", content: "Segue a nossa tabela de atacado, com pedido mínimo de 10 peças:\n\nattachment_id_%{id}" },
    { name: "Guia de medidas", trigger: "medidas", attachment: "Guia de medidas", content: "Olha o nosso guia de medidas para escolher o tamanho certo:\n\nattachment_id_%{id}" },
    { name: "Agradecimento", trigger: "obrigada", content: "Obrigada pela compra! Qualquer coisa, é só chamar por aqui." }
  ].freeze

  # [nome, descrição, arquivo, tipo do arquivo, conteúdo]
  ATTACHMENTS = [
    [ "Tabela de preços de atacado", "Revisada em novembro. Só para compras a partir de 10 peças.", "tabela-atacado.pdf", "application/pdf", :pdf ],
    [ "Guia de medidas", "Medidas de cada tamanho, de PP a GG.", "guia-de-medidas.pdf", "application/pdf", :pdf ],
    [ "Lookbook de verão", "As peças da nova coleção.", "lookbook-verao.png", "image/png", [ 124, 58, 237 ] ],
    [ "Vestido midi de linho", "Foto para mandar no chat.", "vestido-midi-linho.png", "image/png", [ 217, 119, 87 ] ]
  ].freeze

  def self.condition(key, operator, values = [], value_type: nil, query_operator: "and")
    { attributeKey: key, filterOperator: operator, values: values, queryOperator: query_operator, valueType: value_type }.compact
  end

  # [nome, pessoal?, condições]
  CHAT_VIEWS = [
    [ "Não lidas", false, [ condition("unread_messages", "is_greater_than", [ "0" ]) ] ],
    [ "Sem dono", false, [ condition("assigned_account_id", "is_empty") ] ],
    [ "Fechadas", false, [ condition("status", "equal_to", [ "closed" ]) ] ],
    [ "Curitiba e Londrina", true, [ condition("custom_attributes.cidade", "equal_to", %w[Curitiba Londrina], value_type: "text") ] ],
    [ "Compra acima de R$ 500", true, [ condition("custom_attributes.ticket_medio", "is_greater_than", [ "500" ], value_type: "number") ] ]
  ].freeze

  IMPORT_FILE = "clientes-loja-fisica.csv".freeze
  IMPORT_CONTACTS = [
    { "external_id" => "5541999110001", "user_name" => "Helena Martins", "assigned_user_name" => "Camila Rocha", "department_name" => "Atendimento" },
    { "external_id" => "5541999110002", "user_name" => "Otávio Ribeiro", "department_name" => "Comercial" },
    { "external_id" => "5541999110003", "user_name" => "Sofia Carvalho" },
    { "external_id" => "5541999110004", "user_name" => "Bruno Teixeira" },
    { "external_id" => "5541999110005", "user_name" => "Isabela Nogueira", "assigned_user_name" => "Thiago Almeida" }
  ].freeze

  COPILOT_HISTORY = [
    [ "user", "Quais conversas estão sem dono hoje?" ],
    [ "assistant", "Encontrei conversas sem dono, a mais recente é a da **Ana Beatriz Moura**, que quer fechar o vestido midi de linho até sexta. Quer que eu atribua a alguém do Comercial?" ]
  ].freeze

  module_function

  def call
    account = Account.find_by(email: DEMO_EMAIL)
    return nil unless account

    organization = account.organization

    seed_custom_fields(organization)
    seed_chat_attributes(organization)
    seed_tags(organization)
    attachments = seed_attachments(organization)
    seed_quick_replies(organization, attachments)
    seed_chat_views(organization, account)
    seed_import(organization, account)
    seed_copilot(organization, account)

    organization
  end

  def seed_custom_fields(organization)
    CUSTOM_FIELDS.each do |spec|
      field = organization.custom_fields.where(key: spec[:name].parameterize.underscore).take || CustomField.new(organization_id: organization.id.to_s)
      field.update!(spec)
    end
  end

  # Só a chave que falta: o que a pessoa mudou fica. Por fora dos callbacks, para a semente não
  # encher a lista de eventos, e por isso o texto já vai como a normalização deixaria.
  def seed_chat_attributes(organization)
    ATTRIBUTES.each do |name, attributes|
      chat = organization.chats.where(user_name: name).take
      next unless chat

      missing = attributes.reject { |key, _| chat.custom_attributes.key?(key) }
      next if missing.empty?

      normalized = missing.to_h do |key, value|
        [ "custom_attributes.#{key}", key == "ticket_medio" ? CustomAttributes::ValueNormalizer.normalize(value, strategy: "avg") : value ]
      end
      Chat.where(_id: chat.id).update_all("$set" => normalized)
    end
  end

  def seed_tags(organization)
    tags = EXTRA_TAGS.to_h do |name, (color, description)|
      tag = ChatTag.find_or_create_by(name: name, organization_id: organization.id.to_s) do |created|
        created.color = color
        created.description = description
      end
      [ name, tag ]
    end

    APPLIED_TAGS.each do |name, tag_names|
      chat = organization.chats.where(user_name: name).take
      next unless chat

      Chat.where(_id: chat.id).update_all("$addToSet" => { chat_tag_ids: { "$each" => tag_names.map { |tag_name| tags.fetch(tag_name).id } } })
    end
  end

  def seed_attachments(organization)
    ATTACHMENTS.to_h do |name, description, filename, content_type, content|
      attachment = organization.attachments.find_by(name: name)
      unless attachment
        attachment = organization.attachments.new(name: name, description: description, private: false)
        attachment.file.attach(io: StringIO.new(content == :pdf ? pdf_bytes(name) : png_bytes(*content)), filename: filename, content_type: content_type)
        attachment.save!
      end
      [ name, attachment ]
    end
  end

  def seed_quick_replies(organization, attachments)
    QUICK_REPLIES.each do |spec|
      content = spec[:attachment] ? format(spec[:content], id: attachments.fetch(spec[:attachment]).id) : spec[:content]

      organization.quick_replies.find_or_initialize_by(trigger: spec[:trigger]).update!(name: spec[:name], content: content)
    end
  end

  def seed_chat_views(organization, account)
    CHAT_VIEWS.each do |name, personal, payload|
      organization.chat_views.find_or_initialize_by(name: name).update!(account: account, personal: personal, payload: payload)
    end
  end

  # Passa pelo caminho de verdade, sem rede: a importação cria as conversas por fora do provedor.
  def seed_import(organization, account)
    return if organization.contact_imports.exists?(file_name: IMPORT_FILE)

    connector = organization.connectors.where(_type: "Connector::WhatsappWeb").take
    return unless connector

    result = ContactImports::Creator.call(
      organization: organization, account: account, connector: connector, contacts: IMPORT_CONTACTS, file_name: IMPORT_FILE
    )

    ProcessContactImportJob.perform_now([ result.contact_import.id ], organization.id) if result.contact_import
  end

  def seed_copilot(organization, account)
    thread = CopilotThread.find_or_create_for(account_id: account.id, organization_id: organization.id)
    return if thread.messages.any?

    COPILOT_HISTORY.each do |role, content|
      role == "user" ? thread.add_user_message(content) : thread.add_assistant_message(content)
    end
  end

  # Um quadrado de cor, para a tela ter o que mostrar.
  def png_bytes(red, green, blue)
    size = 16
    row = "\x00".b + ([ red, green, blue ].pack("C3") * size)
    chunk = ->(type, data) { [ data.bytesize ].pack("N") + type + data + [ Zlib.crc32(type + data) ].pack("N") }

    "\x89PNG\r\n\x1A\n".b +
      chunk.call("IHDR".b, [ size, size, 8, 2, 0, 0, 0 ].pack("NNC5")) +
      chunk.call("IDAT".b, Zlib::Deflate.deflate(row * size)) +
      chunk.call("IEND".b, "".b)
  end

  # Um PDF de uma página em branco, com o título nos metadados.
  def pdf_bytes(title)
    <<~PDF
      %PDF-1.4
      1 0 obj <</Type/Catalog/Pages 2 0 R>> endobj
      2 0 obj <</Type/Pages/Kids[3 0 R]/Count 1>> endobj
      3 0 obj <</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]>> endobj
      4 0 obj <</Title(#{title.encode('ISO-8859-1', undef: :replace).force_encoding('BINARY')})>> endobj
      trailer <</Root 1 0 R/Info 4 0 R>>
      %%EOF
    PDF
  end
end

inbox_organization = VekooInboxSeeds.call

if inbox_organization
  puts <<~REPORT

    Chat e contatos.

      Campos personalizados  #{inbox_organization.custom_fields.count}
      Mensagens rápidas      #{inbox_organization.quick_replies.count}
      Anexos                 #{inbox_organization.attachments.count}
      Visões salvas          #{inbox_organization.chat_views.count}
      Etiquetas              #{inbox_organization.chat_tags.count}
      Importações            #{inbox_organization.contact_imports.count}
      Conversas              #{inbox_organization.chats.count}
  REPORT
end
