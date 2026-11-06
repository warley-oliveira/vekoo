# frozen_string_literal: true

require "rails_helper"

RSpec.describe Copilot::ConversationAnalyzer do
  let(:organization) { create(:organization) }
  let(:account) { create(:account, organization: organization) }
  let(:events) { [] }
  let(:llm) { scripted_chat(complete: answer) }
  let(:answer) { { chat_id: "outro-id", qualification_score: 8, qualification: "alto", reason: "Perguntou o preço", is_test: false, key_signals: %w[a b c d], recommended_action: "Responder" }.to_json }
  let(:analyzer) { described_class.new(account: account, notify: ->(action, data) { events << [ action, data ] }, chat: llm) }

  def chat_with_messages(*contents, **attributes)
    create(:chat, organization: organization, **attributes).tap do |chat|
      contents.each { |content| create(:chat_text_message, chat: chat, content: content) }
    end
  end

  describe "#analyze_batch" do
    it "analisa conversa por conversa, no modelo rápido" do
      first = chat_with_messages("Quanto custa?")
      second = chat_with_messages("Bom dia")

      result = analyzer.analyze_batch([ first.id.to_s, second.id.to_s ])

      expect(result[:chats].map { |entry| entry[:chat_id] }).to contain_exactly(first.id.to_s, second.id.to_s)
      expect(llm).to have_received(:complete).twice.with(hash_including(model: Ai::Chat::FAST_MODEL, effort: "low"))
    end

    # O id vem da nossa entrada: o modelo não tem como apontar para outra conversa.
    it "usa o id da conversa, não o que o modelo devolveu" do
      chat = chat_with_messages("Quanto custa?")

      expect(analyzer.analyze_batch([ chat.id.to_s ])[:chats].first[:chat_id]).to eq(chat.id.to_s)
    end

    it "limita os sinais e a nota" do
      allow(llm).to receive(:complete).and_return({ qualification_score: 50, qualification: "quente", key_signals: %w[a b c d] }.to_json)
      chat = chat_with_messages("Oi")

      entry = analyzer.analyze_batch([ chat.id.to_s ])[:chats].first

      expect(entry[:qualification_score]).to eq(10)
      expect(entry[:key_signals]).to eq(%w[a b c])
    end

    it "aceita a resposta dentro de cerca de markdown" do
      allow(llm).to receive(:complete).and_return("```json\n#{answer}\n```")
      chat = chat_with_messages("Oi")

      expect(analyzer.analyze_batch([ chat.id.to_s ])[:chats].first[:qualification]).to eq("alto")
    end

    it "classificação desconhecida vira não qualificado" do
      allow(llm).to receive(:complete).and_return({ qualification: "excelente", qualification_score: 5 }.to_json)
      chat = chat_with_messages("Oi")

      expect(analyzer.analyze_batch([ chat.id.to_s ])[:chats].first[:qualification]).to eq("nao_qualificado")
    end

    it "uma resposta ilegível não derruba as outras" do
      allow(llm).to receive(:complete).and_return("não é json", answer)
      first = chat_with_messages("Oi")
      second = chat_with_messages("Olá")

      entries = analyzer.analyze_batch([ first.id.to_s, second.id.to_s ])[:chats]

      expect(entries.map { |entry| entry[:qualification] }).to contain_exactly("desconhecido", "alto")
    end

    it "o modelo fora do ar vira análise indisponível, sem estourar" do
      allow(llm).to receive(:complete).and_raise(Ai::Chat::Failed, "caiu")
      chat = chat_with_messages("Oi")

      result = analyzer.analyze_batch([ chat.id.to_s ])

      expect(result[:chats].first).to include(qualification: "desconhecido", qualification_score: 0)
      expect(result[:summary]).to include("1 sem análise")
    end

    it "resume pelos números, sem modelo" do
      allow(llm).to receive(:complete).and_return({ qualification: "quente", qualification_score: 9, is_test: true }.to_json)
      chat = chat_with_messages("Oi")

      expect(analyzer.analyze_batch([ chat.id.to_s ])[:summary]).to eq("1 conversas analisadas individualmente. | 1 quente(s) | 1 conversa(s) de teste detectada(s)")
    end

    it "manda quem falou o quê, cortando mensagem longa, e diz que o texto é dado" do
      chat = create(:chat, organization: organization, user_name: "Fernanda")
      ChatMessage::Text.create!(chat: chat, role: "assistant", content: "Oi, Fernanda")
      create(:chat_text_message, chat: chat, role: "user", content: "x" * 500)

      analyzer.analyze_batch([ chat.id.to_s ], user_question: "tem orçamento?")

      expect(llm).to have_received(:complete).with(
        hash_including(
          system: a_string_including("nunca instrução"),
          prompt: a_string_including("ATENDENTE: Oi, Fernanda", "CLIENTE: #{'x' * 300}", "tem orçamento?")
        )
      )
    end

    it "não analisa conversa sem mensagens" do
      chat = create(:chat, organization: organization)

      expect(analyzer.analyze_batch([ chat.id.to_s ])[:chats]).to eq([])
      expect(llm).not_to have_received(:complete)
    end

    it "não analisa conversa de outra organização" do
      foreign = create(:chat, organization: create(:organization))
      create(:chat_text_message, chat: foreign)

      expect(analyzer.analyze_batch([ foreign.id.to_s ])[:chats]).to eq([])
    end

    it "respeita o teto do lote" do
      stub_const("#{described_class}::MAX_BATCH_SIZE", 1)
      first = chat_with_messages("Oi")
      second = chat_with_messages("Olá")

      analyzer.analyze_batch([ first.id.to_s, second.id.to_s ])

      expect(llm).to have_received(:complete).once
    end

    it "avisa o andamento de cada conversa" do
      chat = chat_with_messages("Oi", user_name: "Fernanda", external_id: "5531971810932")

      analyzer.analyze_batch([ chat.id.to_s ])

      expect(events.map { |action, data| [ action, data[:toolName], data[:status] ] }).to eq(
        [ [ "tool_activity", "analyze_chat", "started" ], [ "tool_activity", "analyze_chat", "completed" ] ]
      )
      expect(events.first.last[:contact]).to eq(userName: "Fernanda", phoneNumber: "5531971810932")
      expect(analyzer.tool_activities.size).to eq(1)
    end

    it "responde em lista vazia sem chamar o modelo" do
      expect(analyzer.analyze_batch([])).to eq(chats: [], summary: "Nenhuma conversa para analisar.")
    end
  end

  describe "#qualify_leads" do
    it "combina 40% de atividade com 60% de conteúdo" do
      chat = chat_with_messages("Oi")

      result = analyzer.qualify_leads([ { chat: chat, score: 50.0 } ])

      # 50 * 0,4 + 8 * 10 * 0,6
      expect(result.first).to include(combined_score: 68.0, qualification: "alto", qualification_score: 8, reason: "Perguntou o preço")
    end

    it "tira teste, spam e o que falhou na análise" do
      allow(llm).to receive(:complete).and_return({ qualification: "nao_qualificado", qualification_score: 1 }.to_json)
      low = chat_with_messages("teste")

      expect(analyzer.qualify_leads([ { chat: low, score: 90 } ])).to be_empty
    end

    it "ordena pela nota combinada" do
      first = chat_with_messages("Oi")
      second = chat_with_messages("Olá")

      result = analyzer.qualify_leads([ { chat: first, score: 10 }, { chat: second, score: 80 } ])

      expect(result.map { |entry| entry[:chat] }).to eq([ second, first ])
    end

    it "responde em lista vazia" do
      expect(analyzer.qualify_leads([])).to eq([])
    end
  end
end
