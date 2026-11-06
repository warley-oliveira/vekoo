# Semente do domínio "connectors": canais e conversas na organização da conta de
# demonstração. É obra do usuário fictício, não interface: fica em pt-BR mesmo quando a API
# responde em inglês.
#
# Nenhuma credencial de verdade. Quem funciona de ponta a ponta é o widget do site, que não fala
# com provedor nenhum: dá para responder às conversas dele na tela. Os canais de WhatsApp e
# Instagram estão desconectados, com histórico; enviar por eles termina em `failed`, sem rede.
#
# Idempotente: cada canal, etiqueta e conversa é achado pela sua chave natural. Conversa que já
# existe fica como está, então rodar de novo não duplica mensagem nem desfaz o que a pessoa fez.

Object.send(:remove_const, :VekooConnectorSeeds) if defined?(VekooConnectorSeeds)

module VekooConnectorSeeds
  DEMO_EMAIL = "marina.duarte@exemplo.com.br"

  TAGS = {
    "cliente-novo" => [ "#7c3aed", "Primeiro contato" ],
    "orcamento" => [ "#2563eb", "Pediu orçamento" ],
    "agendado" => [ "#059669", "Tem horário marcado" ],
    "retorno" => [ "#d97706", "Precisa de retorno" ],
    "urgente" => [ "#dc2626", "Responder primeiro" ],
    "vip" => [ "#db2777", "Cliente de sempre" ],
    "pos-venda" => [ "#0891b2", "Já comprou" ]
  }.freeze

  # Cada item: [quem, tipo, conteúdo, minutos depois do início da conversa, extras].
  # `:contact` é o contato; `:us` é uma pessoa do nosso lado; `:note`, nota do histórico.
  CHATS = [
    {
      key: "ana-beatriz", channel: :widget, name: "Ana Beatriz Moura", days_ago: 0, status: "open", unread: 2,
      tags: %w[cliente-novo orcamento], team: "Comercial", messages: [
        [ :contact, :text, "Oi! Vi o anúncio de vocês no Instagram. Quanto fica a limpeza de pele?", 0 ],
        [ :us, :text, "Oi, Ana! Que bom ter você aqui. A limpeza de pele completa sai por R$ 180 e leva uma hora.", 3, { sender: "Camila Rocha" } ],
        [ :contact, :text, "Vocês atendem sábado de manhã?", 6 ],
        [ :contact, :text, "Se tiver horário, já queria marcar", 7 ]
      ]
    },
    {
      key: "joao-pedro", channel: :widget, name: "João Pedro Almeida", days_ago: 0, status: "open", unread: 0,
      assigned: "camila.rocha@exemplo.com.br", team: "Atendimento", tags: %w[agendado], messages: [
        [ :contact, :text, "Bom dia, preciso remarcar meu horário de quinta", 0 ],
        [ :note, "assigned-user-notation", "Camila Rocha assumiu esta conversa para si.", 2 ],
        [ :us, :text, "Bom dia, João! Claro. Tenho sexta às 10h ou às 15h30, qual fica melhor?", 4, { sender: "Camila Rocha", status: "read" } ],
        [ :contact, :text, "Sexta às 15h30, por favor", 9, { reaction: "👍" } ],
        [ :us, :text, "Pronto, remarcado para sexta às 15h30. Até lá!", 11, { sender: "Camila Rocha", status: "delivery_ack" } ]
      ]
    },
    {
      key: "fernanda-lima", channel: :whatsapp_web, phone: "5531971810932", name: "Fernanda Lima", days_ago: 1, status: "open", unread: 1,
      tags: %w[vip retorno], team: "Pós-venda", messages: [
        [ :contact, :text, "Oi, tudo bem? O creme que comprei acabou, vocês têm ainda?", 0 ],
        [ :us, :text, "Oi, Fernanda! Temos sim, chegou lote novo esta semana.", 5, { sender: "Thiago Almeida", status: "read" } ],
        [ :contact, :image, "Esse aqui, da foto", 8, { file: 0 } ],
        [ :us, :text, "Esse mesmo. Separo um para você?", 12, { sender: "Thiago Almeida", status: "read", quote: 2 } ],
        [ :contact, :audio, "-", 20 ]
      ]
    },
    {
      key: "carlos-eduardo", channel: :whatsapp_web, phone: "5511987651234", name: "Carlos Eduardo Santos", days_ago: 1, status: "open", unread: 0,
      assigned: "juliana.ferreira@exemplo.com.br", team: "Comercial", tags: %w[orcamento], messages: [
        [ :contact, :text, "Boa tarde. Vocês fazem pacote para empresa? Somos 12 pessoas.", 0 ],
        [ :us, :text, "Boa tarde, Carlos! Fazemos sim. Vou te mandar a tabela de pacotes corporativos.", 6, { sender: "Juliana Ferreira", status: "read" } ],
        [ :us, :media, "Tabela de pacotes corporativos", 7, { sender: "Juliana Ferreira", status: "read", file_name: "pacotes-corporativos.pdf", media_type: "application/pdf" } ],
        [ :contact, :text, "Recebi, obrigado. Vou levar para a diretoria e te retorno.", 40 ]
      ]
    },
    {
      key: "marcia-regina", channel: :whatsapp_web, phone: "5521998761234", name: "Márcia Regina Costa", days_ago: 2, status: "open", unread: 3,
      tags: %w[urgente retorno], messages: [
        [ :contact, :text, "Bom dia!", 0 ],
        [ :contact, :text, "Fiz o procedimento ontem e a pele ficou bem vermelha", 1 ],
        [ :contact, :image, "Olha como está", 2, { file: 1 } ],
        [ :contact, :image, "", 2, { file: 2 } ],
        [ :contact, :text, "Isso é normal? Estou preocupada", 3 ]
      ]
    },
    {
      key: "lucas-oliveira", channel: :whatsapp_web, phone: "5541991234567", name: "Lucas Oliveira", days_ago: 3, status: "closed", unread: 0,
      tags: %w[pos-venda], team: "Atendimento", won: true, messages: [
        [ :contact, :text, "Chegou certinho, obrigado!", 0, { reaction: "❤️" } ],
        [ :us, :text, "Que ótimo, Lucas! Qualquer coisa é só chamar.", 3, { sender: "Thiago Almeida", status: "read" } ],
        [ :note, "automation-toggle-notation", "Thiago Almeida pausou a automação.", 3 ]
      ]
    },
    {
      key: "patricia-gomes", channel: :whatsapp_cloud, phone: "5531988887777", name: "Patrícia Gomes", days_ago: 3, status: "open", unread: 1,
      ad: true, tags: %w[cliente-novo], team: "Comercial", messages: [
        [ :contact, :text, "Olá! Tenho interesse e queria mais informações, por favor.", 0 ]
      ]
    },
    {
      key: "roberto-nascimento", channel: :whatsapp_cloud, phone: "5571999990000", name: "Roberto Nascimento", days_ago: 4, status: "open", unread: 0,
      tags: %w[agendado], messages: [
        [ :us, :text, "Olá, Roberto! Sua avaliação é amanhã às 9h. Podemos confirmar?", 0, { sender: "Clínica Bem-Estar", status: "read", template: true } ],
        [ :contact, :text, "Confirmar", 25 ],
        [ :us, :text, "Confirmado. Até amanhã!", 27, { sender: "Rafael Nunes", status: "failed", status_message: "Fora da janela de 24 horas. Para iniciar ou retomar a conversa, você deve enviar um Template aprovado." } ]
      ]
    },
    {
      key: "camila-ferraz", channel: :instagram, external_id: "178410000000042", name: "Camila Ferraz", username: "camila.ferraz", days_ago: 5, status: "open", unread: 0,
      tags: %w[cliente-novo], messages: [
        [ :contact, :text, "Oi! Vocês têm horário para o fim do mês?", 0 ],
        [ :us, :text, "Oi, Camila! Temos sim. Prefere manhã ou tarde?", 15, { sender: "Camila Rocha", status: "read" } ],
        [ :contact, :text, "Tarde!", 18 ]
      ]
    },
    {
      key: "daniela-souza", channel: :whatsapp_web, phone: "5585996543210", name: "Daniela Souza", days_ago: 6, status: "closed", unread: 0,
      tags: %w[pos-venda vip], lost: true, messages: [
        [ :contact, :text, "Mandei a mensagem errada, pode desconsiderar", 0, { deleted: true } ],
        [ :contact, :text, "Desculpa! Era para outra pessoa.", 1 ],
        [ :us, :text, "Sem problema, Daniela!", 4, { sender: "Thiago Almeida", status: "read" } ]
      ]
    }
  ].freeze

  # Histórico para os painéis terem o que somar: conversas curtas, espalhadas por 30 dias.
  HISTORY_NAMES = [
    "Beatriz Carvalho", "Rafael Mendes", "Juliana Prado", "Thiago Ribeiro", "Larissa Teixeira",
    "Bruno Cardoso", "Aline Barros", "Felipe Araújo", "Vanessa Rocha", "Gustavo Martins",
    "Renata Pires", "Eduardo Freitas", "Sabrina Lopes", "André Moreira", "Priscila Nunes",
    "Marcelo Duarte", "Tatiane Vieira", "Diego Fernandes", "Natália Castro", "Vinícius Ramos"
  ].freeze

  HISTORY_SCRIPTS = [
    [ "Boa tarde, vocês abrem no feriado?", "Boa tarde! Abrimos sim, das 9h às 14h." ],
    [ "Qual o valor da avaliação?", "A avaliação é gratuita. Quer marcar um horário?" ],
    [ "Vocês parcelam no cartão?", "Parcelamos em até 6 vezes sem juros." ],
    [ "Onde vocês ficam?", "Estamos na Rua das Flores, 120, no Centro." ],
    [ "Preciso cancelar meu horário de amanhã", "Certo, já cancelei. Quando quiser, é só remarcar." ]
  ].freeze

  # Cinza discreto, cor de pele, um tom de cada: só para as bolhas terem imagem de verdade.
  IMAGE_COLORS = [ [ 201, 176, 158 ], [ 214, 162, 150 ], [ 186, 196, 208 ] ].freeze

  module_function

  def call
    account = Account.find_by(email: DEMO_EMAIL)
    return nil unless account

    organization = account.organization
    channels = seed_channels(organization)
    tags = seed_tags(organization)
    seed_templates(channels[:whatsapp_cloud])

    CHATS.each { |spec| seed_chat(organization, channels, tags, spec) }
    seed_history(organization, channels, tags)

    organization
  end

  def seed_channels(organization)
    scope = { organization_id: organization.id }

    {
      widget: Connector::WebWidget.where(scope).take || Connector::WebWidget.create!(
        **scope, status: :active, bot_display_name: "Site da Clínica", welcome_message: "Olá! Como podemos ajudar?"
      ),
      whatsapp_web: Connector::WhatsappWeb.where(**scope, instance_name: "IWA-demonstracao").take || Connector::WhatsappWeb.create!(
        **scope, status: :closed, provider_api: "evolution_api", instance_name: "IWA-demonstracao", base_url: "http://evolution.invalid",
        number_id: "5531930001234", profile_name: "Clínica Bem-Estar"
      ),
      whatsapp_cloud: Connector::WhatsappCloud.where(**scope, phone_number_id: 100_000_000_001).take || Connector::WhatsappCloud.create!(
        **scope, status: :inactive, phone_number_id: 100_000_000_001, waba_id: 200_000_000_001, business_id: 300_000_000_001,
        verified_name: "Clínica Bem-Estar Oficial", display_phone_number: "+55 31 3000-1234", quality_rating: "GREEN", fb_status: "CONNECTED"
      ),
      instagram: Connector::InstagramDirect.where(**scope, instagram_account_id: "178410000000001").take || Connector::InstagramDirect.create!(
        **scope, status: :inactive, auth_provider: "instagram_login", instagram_account_id: "178410000000001",
        instagram_username: "clinicabemestar", account_name: "Clínica Bem-Estar", followers_count: 12_480, follows_count: 320, media_count: 412
      )
    }
  end

  def seed_tags(organization)
    tags = TAGS.to_h do |name, (color, description)|
      tag = ChatTag.find_or_create_by(name: name, organization_id: organization.id) do |new_tag|
        new_tag.color = color
        new_tag.description = description
      end
      [ name, tag ]
    end

    tags.merge("ganho" => ChatTag.system_tag!(:won, organization.id), "perdido" => ChatTag.system_tag!(:lost, organization.id))
  end

  # Com `status` preenchido e sem validar, nada chama a Meta.
  def seed_templates(connector)
    [
      { template_id: "seed-confirmacao", name: "confirmacao_avaliacao", category: "UTILITY", status: :approved,
        components: [ { "type" => "BODY", "text" => "Olá, {{1}}! Sua avaliação é {{2}}. Podemos confirmar?" },
                      { "type" => "BUTTONS", "buttons" => [ { "type" => "QUICK_REPLY", "text" => "Confirmar" }, { "type" => "QUICK_REPLY", "text" => "Remarcar" } ] } ] },
      { template_id: "seed-promocao", name: "promocao_mes", category: "MARKETING", status: :approved,
        components: [ { "type" => "HEADER", "format" => "TEXT", "text" => "Novidade do mês" },
                      { "type" => "BODY", "text" => "{{1}}, neste mês a limpeza de pele sai com 20% de desconto." },
                      { "type" => "FOOTER", "text" => "Clínica Bem-Estar" } ] },
      { template_id: "seed-pendente", name: "lembrete_retorno", category: "UTILITY", status: :pending,
        components: [ { "type" => "BODY", "text" => "{{1}}, está na hora do seu retorno. Vamos marcar?" } ] },
      { template_id: "seed-removido", name: "campanha_antiga", category: "MARKETING", status: :removed, removed_at: 10.days.ago,
        components: [ { "type" => "BODY", "text" => "Oferta encerrada." } ] }
    ].each do |attributes|
      template = WhatsappTemplate.where(connector_id: connector.id, template_id: attributes[:template_id]).first_or_initialize
      next if template.persisted?

      template.assign_attributes(language: "pt_BR", last_synced_at: Time.current, **attributes.except(:template_id))
      template.save!(validate: false)
    end
  end

  def seed_chat(organization, channels, tags, spec)
    connector = channels.fetch(spec[:channel])
    external_id = spec[:external_id] || spec[:phone] || "visitante-#{spec[:key]}"
    return if Chat.where(connector_id: connector.id, external_id: external_id).exists?

    started_at = spec[:days_ago].days.ago.change(min: 7) - 2.hours
    chat = Chat.create!(
      connector: connector,
      organization_id: organization.id,
      external_id: external_id,
      user_name: spec[:name],
      audience_type: audience_type_for(spec[:channel]),
      audience_user_name: spec[:username],
      status: spec[:status],
      automation_enabled: spec[:status] == "open",
      assigned_account_id: spec[:assigned] && Account.find_by(email: spec[:assigned])&.id,
      team_id: spec[:team] && organization.teams.find_by(name: spec[:team])&.id,
      chat_tag_ids: spec[:tags].map { |name| tags.fetch(name).id } + system_tag_ids(tags, spec),
      unread_messages: spec[:unread],
      session_start_at: started_at,
      created_at: started_at,
      ignore_events: true
    )

    add_ad_greeting(chat, started_at) if spec[:ad]

    created = spec[:messages].each_with_index.map do |(who, type, content, minutes, extras), index|
      build_message(chat, spec[:key], index, who, type, content, started_at + minutes.minutes, extras || {}).tap(&:save!)
    end

    link_replies(created, spec[:messages])
    finish_preview(chat, created)
  end

  def seed_history(organization, channels, tags)
    HISTORY_NAMES.each_with_index do |name, index|
      phone = "55319#{format('%08d', 70_000_000 + (index * 137))}"
      connector = channels[index.even? ? :whatsapp_web : :whatsapp_cloud]
      next if Chat.where(connector_id: connector.id, external_id: phone).exists?

      started_at = (8 + index).days.ago.change(hour: 9 + (index % 9), min: index * 2)
      chat = Chat.create!(
        connector: connector,
        organization_id: organization.id,
        external_id: phone,
        user_name: name,
        status: index % 3 == 0 ? "open" : "closed",
        automation_enabled: index % 3 == 0,
        chat_tag_ids: [ tags.fetch(TAGS.keys[index % TAGS.size]).id ] + (index % 4 == 0 ? [ tags.fetch(index % 8 == 0 ? "ganho" : "perdido").id ] : []),
        session_start_at: started_at,
        created_at: started_at,
        ignore_events: true
      )

      question, answer = HISTORY_SCRIPTS[index % HISTORY_SCRIPTS.size]
      created = [
        build_message(chat, "historico-#{index}", 0, :contact, :text, question, started_at, {}),
        build_message(chat, "historico-#{index}", 1, :us, :text, answer, started_at + (2 + (index % 25)).minutes, { sender: "Thiago Almeida", status: "read" })
      ].each(&:save!)

      finish_preview(chat, created)
    end
  end

  def audience_type_for(channel)
    { widget: "web", instagram: "instagram" }.fetch(channel, "whatsapp_api")
  end

  def system_tag_ids(tags, spec)
    [ (tags.fetch("ganho").id if spec[:won]), (tags.fetch("perdido").id if spec[:lost]) ].compact
  end

  def add_ad_greeting(chat, started_at)
    ChatMessage::Text.create!(
      role: "base",
      role_base_type: "instagram-ad-greeting",
      content: "Olá! Que bom falar com você. Como podemos ajudar?",
      chat: chat,
      created_at: started_at - 1.second,
      ignore_events: true,
      external_ad_reply: {
        title: "Limpeza de pele com 20% de desconto",
        body: "Só neste mês, na Clínica Bem-Estar.",
        source_type: "ad",
        source_app: "instagram",
        greeting_message_body: "Olá! Que bom falar com você. Como podemos ajudar?"
      }
    )
  end

  def build_message(chat, key, index, who, type, content, at, extras)
    return build_note(chat, type, content, at) if who == :note

    from_contact = who == :contact
    attributes = {
      role: from_contact ? "user" : "assistant",
      chat: chat,
      content: content.to_s,
      message_id: "seed-#{key}-#{index}",
      message_origin: from_contact ? "platform" : "frontend",
      sender_name: from_contact ? chat.user_name : extras[:sender],
      status: from_contact ? nil : extras[:status],
      status_message: extras[:status_message],
      created_at: at,
      ignore_events: true,
      reactions: extras[:reaction] ? [ { "emoji" => extras[:reaction], "from" => from_contact ? "assistant" : "user", "sender_name" => from_contact ? "Camila Rocha" : chat.user_name, "reacted_at" => at + 1.minute } ] : [],
      deleted_at: extras[:deleted] ? at + 1.minute : nil,
      deleted_scope: extras[:deleted] ? "everyone" : nil
    }

    case type
    when :text then ChatMessage::Text.new(**attributes)
    when :image then ChatMessage::Image.new(**attributes, caption: content.presence, image_url: Media::Storage.path_for(image_blob(extras[:file])))
    when :audio then ChatMessage::Audio.new(**attributes, audio_url: Media::Storage.path_for(audio_blob))
    when :media
      ChatMessage::Media.new(
        **attributes, caption: content.presence, media_type: extras[:media_type], media_url: Media::Storage.path_for(pdf_blob(extras[:file_name])),
        media_properties: { "fileName" => extras[:file_name], "mimeType" => extras[:media_type] }
      )
    end
  end

  def build_note(chat, role_base_type, content, at)
    ChatMessage::Text.new(role: "base", role_base_type: role_base_type, content: content, chat: chat, created_at: at, ignore_events: true)
  end

  # `quote: 2` em um item aponta para o item de índice 2 da mesma conversa.
  def link_replies(created, specs)
    specs.each_with_index do |(_who, _type, _content, _minutes, extras), index|
      next unless extras&.dig(:quote)

      created[index].set(reply_to_message_id: created[extras[:quote]].id.to_s)
    end
  end

  # A mensagem de semente não passa pelo sync (`ignore_events`): a prévia sai aqui, de uma vez.
  def finish_preview(chat, created)
    last = created.reject { |message| message.role == "base" }.max_by(&:created_at)
    return unless last

    chat.set(
      last_message_at: last.created_at,
      last_message_type: last.type_element,
      last_message_content: last.content,
      last_message_by: last.role
    )
  end

  # --- arquivos pequenos, gerados aqui: nada de binário no repositório nem rede na semente ----

  def blob_for(filename)
    ActiveStorage::Blob.find_by(filename: filename) || yield
  end

  def image_blob(index)
    filename = "semente-foto-#{index}.png"
    blob_for(filename) do
      Media::Storage.store_io(StringIO.new(png_bytes(*IMAGE_COLORS.fetch(index))), filename: filename, content_type: "image/png")
    end
  end

  def audio_blob
    filename = "semente-recado.wav"
    blob_for(filename) { Media::Storage.store_io(StringIO.new(wav_bytes), filename: filename, content_type: "audio/wav") }
  end

  def pdf_blob(filename)
    blob_for(filename) { Media::Storage.store_io(StringIO.new(pdf_bytes), filename: filename, content_type: "application/pdf") }
  end

  # Quadrado 320 x 320 com um degradê leve, para não parecer um bloco chapado.
  def png_bytes(red, green, blue)
    require "zlib"

    size = 320
    rows = (0...size).map do |y|
      shade = 1.0 - (y.to_f / size * 0.18)
      "\x00".b + ([ (red * shade).to_i, (green * shade).to_i, (blue * shade).to_i ].pack("C3") * size)
    end

    chunk = lambda do |type, data|
      [ data.bytesize ].pack("N") + type + data + [ Zlib.crc32(type + data) ].pack("N")
    end

    "\x89PNG\r\n\x1A\n".b +
      chunk.call("IHDR".b, [ size, size, 8, 2, 0, 0, 0 ].pack("NNC5")) +
      chunk.call("IDAT".b, Zlib::Deflate.deflate(rows.join)) +
      chunk.call("IEND".b, "".b)
  end

  # Dois segundos de um tom baixo, para o player ter o que tocar.
  def wav_bytes
    rate = 8_000
    samples = (0...(rate * 2)).map { |i| (Math.sin(2 * Math::PI * 220 * i / rate) * 4_000).to_i }.pack("s<*")

    "RIFF".b + [ 36 + samples.bytesize ].pack("V") + "WAVEfmt ".b +
      [ 16, 1, 1, rate, rate * 2, 2, 16 ].pack("VvvVVvv") +
      "data".b + [ samples.bytesize ].pack("V") + samples
  end

  def pdf_bytes
    <<~PDF
      %PDF-1.4
      1 0 obj <</Type/Catalog/Pages 2 0 R>> endobj
      2 0 obj <</Type/Pages/Kids[3 0 R]/Count 1>> endobj
      3 0 obj <</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]>> endobj
      trailer <</Root 1 0 R>>
      %%EOF
    PDF
  end
end

connectors_organization = VekooConnectorSeeds.call

if connectors_organization
  puts <<~REPORT

    Canais e conversas.

      Canais      #{connectors_organization.connectors.count} (#{connectors_organization.connectors.active.count} ativo, o widget do site)
      Conversas   #{connectors_organization.chats.count}
      Mensagens   #{ChatMessage::Base.unscoped.where(:chat_id.in => connectors_organization.chats.pluck(:_id)).count}
      Etiquetas   #{connectors_organization.chat_tags.count}
      Modelos     #{WhatsappTemplate.where(:connector_id.in => connectors_organization.connectors.pluck(:_id)).count}
  REPORT
end
