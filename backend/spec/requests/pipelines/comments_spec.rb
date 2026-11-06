require "rails_helper"

RSpec.describe "Pipelines: comentários", type: :request do
  let(:organization) { create(:organization) }
  let(:owner) { create(:account, organization: organization) }
  let(:headers) { auth_headers(owner) }
  let(:board) { create(:pipeline_board, organization: organization) }
  let(:stage) { create(:pipeline_stage, board: board) }
  let(:card) { create(:pipeline_card, stage: stage) }
  let(:comments_path) { card_path(card, "/comments") }

  it "exige sessão e permissão" do
    get comments_path
    expect(response).to have_http_status(:unauthorized)

    get comments_path, headers: auth_headers(member_with(chat: "all"))
    expect(response).to have_http_status(:forbidden)
  end

  it "responde 404 para card de outra organização" do
    get card_path(create(:pipeline_card), "/comments"), headers: headers

    expect(response).to have_http_status(:not_found)
  end

  it "em quadro restrito, comentário de card alheio é 404" do
    role = create(:access_role, organization: organization)
    board.update!(card_visibility: "assigned", card_visibility_bypass_role_ids: [ role.id ])

    get comments_path, headers: auth_headers(pipelines_member)

    expect(response).to have_http_status(:not_found)
  end

  describe "GET" do
    it "traz os mais recentes, em ordem de conversa" do
      older = create(:pipeline_comment, card: card, author: owner, body: "Primeiro", created_at: 2.days.ago)
      newer = create(:pipeline_comment, card: card, author: owner, body: "Segundo", created_at: 1.day.ago)

      get comments_path, headers: headers

      expect(response).to have_http_status(:ok)
      expect(json["comments"].map { |comment| comment["id"] }).to eq([ older.id, newer.id ])
      expect(json).to include("hasMore" => false, "nextCursor" => nil, "totalCount" => 2)
    end

    it "pagina para trás sem repetir e sem deixar nenhum de fora, o que na origem acontecia" do
      created = Array.new(25) do |index|
        create(:pipeline_comment, card: card, author: owner, body: "Comentário #{index}", created_at: (100 - index).minutes.ago)
      end

      get comments_path, headers: headers
      first_page = json["comments"].map { |comment| comment["body"] }
      expect(first_page.size).to eq(20)
      expect(first_page.last).to eq("Comentário 24")
      expect(json["hasMore"]).to be(true)

      get comments_path, params: { before: json["nextCursor"] }, headers: headers
      second_page = json["comments"].map { |comment| comment["body"] }
      expect(second_page).to eq((0..4).map { |index| "Comentário #{index}" })
      expect(json["hasMore"]).to be(false)

      expect((second_page + first_page).uniq.size).to eq(created.size)
    end

    it "traz os fixados à parte, só na primeira página" do
      pinned = create(:pipeline_comment, card: card, author: owner, body: "Importante", pinned: true, created_at: 1.year.ago)
      create(:pipeline_comment, card: card, author: owner, body: "Comum")

      get comments_path, headers: headers

      expect(json["pinned"].map { |comment| comment["id"] }).to eq([ pinned.id ])
      expect(json["comments"].map { |comment| comment["body"] }).to eq([ "Comum" ])

      get comments_path, params: { before: Time.current.utc.iso8601(6) }, headers: headers
      expect(json["pinned"]).to be_empty
    end

    it "traz as respostas dentro do comentário, e autor, reações e contagem" do
      root = create(:pipeline_comment, card: card, author: owner, body: "Pergunta")
      create(:pipeline_comment, card: card, author: owner, body: "Resposta", parent: root)
      root.reactions.create!(user: owner, emoji: "👍")

      get comments_path, headers: headers

      comment = json["comments"].first
      expect(comment).to include("replyCount" => 1)
      expect(comment["replies"].first).to include("body" => "Resposta", "parentId" => root.id)
      expect(comment["author"]).to include("type" => "user", "id" => owner.id, "name" => owner.name)
      expect(comment["reactions"]).to eq([ { "emoji" => "👍", "count" => 1, "accountIds" => [ owner.id ] } ])
      expect(json["totalCount"]).to eq(2)
    end

    it "ignora cursor inválido" do
      get comments_path, params: { before: "ontem" }, headers: headers

      expect(response).to have_http_status(:ok)
    end
  end

  describe "POST" do
    it "cria, assinado por quem pediu, e registra na atividade" do
      post comments_path, params: { comment: { body: "Cliente confirmou" } }, headers: headers, as: :json

      expect(response).to have_http_status(:created)
      expect(json).to include("body" => "Cliente confirmou", "cardId" => card.id, "pinned" => false)
      expect(json["author"]).to include("type" => "user", "id" => owner.id)

      activity = card.activities.find_by(action: "commented")
      expect(activity.details).to include("body" => "Cliente confirmou")
      expect(activity.account_id).to eq(owner.id)
    end

    it "responde 422 sem texto" do
      post comments_path, params: { comment: { body: "" } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "field")).to eq("body")
    end

    it "responde 422 para texto grande demais" do
      post comments_path, params: { comment: { body: "x" * (Pipelines::Comment::MAX_BODY_LENGTH + 1) } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
    end

    it "responde a um comentário do mesmo card" do
      root = create(:pipeline_comment, card: card, author: owner)

      post comments_path, params: { comment: { body: "Resposta", parentId: root.id } }, headers: headers, as: :json

      expect(json["parentId"]).to eq(root.id)
    end

    it "resposta a uma resposta entra na mesma conversa" do
      root = create(:pipeline_comment, card: card, author: owner)
      reply = create(:pipeline_comment, card: card, author: owner, parent: root)

      post comments_path, params: { comment: { body: "Mais uma", parentId: reply.id } }, headers: headers, as: :json

      expect(json["parentId"]).to eq(root.id)
    end

    it "responde 422 para comentário de outro card" do
      other = create(:pipeline_comment, card: create(:pipeline_card, stage: stage), author: owner)

      post comments_path, params: { comment: { body: "Resposta", parentId: other.id } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
    end

    it "anexa arquivos em multipart" do
      file = Rack::Test::UploadedFile.new(StringIO.new("%PDF-1.4 proposta"), "application/pdf", original_filename: "proposta.pdf")

      post comments_path, params: { comment: { body: "Segue a proposta", files: [ file ] } }, headers: headers

      expect(response).to have_http_status(:created)
      expect(json["attachments"].first).to include("fileName" => "proposta.pdf", "contentType" => "application/pdf")
      expect(json["attachments"].first["url"]).to start_with("/rails/active_storage")
    end

    it "responde 422 para arquivos demais" do
      files = Array.new(Pipelines::MAX_FILES_PER_COMMENT + 1) do
        Rack::Test::UploadedFile.new(StringIO.new("x"), "text/plain", original_filename: "a.txt")
      end

      post comments_path, params: { comment: { body: "Muitos", files: files } }, headers: headers

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("tooManyFiles")
    end

    it "transmite para quem está no quadro" do
      stream = ApplicationCable::Channel.organization_stream(organization.id, PipelineBoardChannel.full_card_stream(board))
      path = comments_path

      expect { post path, params: { comment: { body: "Oi" } }, headers: headers, as: :json }
        .to have_broadcasted_to(stream).with { |payload|
          expect(payload["event"]).to eq("comment_created")
          expect(payload.dig("data", "cardId")).to eq(card.id)
          expect(payload.dig("data", "comment", "body")).to eq("Oi")
        }
    end
  end

  describe "PATCH" do
    let(:comment) { create(:pipeline_comment, card: card, author: owner) }

    it "quem escreveu edita, e fica marcado" do
      patch "#{comments_path}/#{comment.id}", params: { comment: { body: "Corrigido" } }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json).to include("body" => "Corrigido", "editedAt" => be_a(Integer))
    end

    it "os outros não" do
      patch "#{comments_path}/#{comment.id}", params: { comment: { body: "Forjado" } },
        headers: auth_headers(pipelines_member), as: :json

      expect(response).to have_http_status(:forbidden)
    end

    it "comentário da automação ninguém edita" do
      automated = card.comments.create!(body: "Da automação", automation_source: "script")

      patch "#{comments_path}/#{automated.id}", params: { comment: { body: "Forjado" } }, headers: headers, as: :json

      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "DELETE" do
    it "apaga com as respostas" do
      root = create(:pipeline_comment, card: card, author: owner)
      reply = create(:pipeline_comment, card: card, author: owner, parent: root)

      delete "#{comments_path}/#{root.id}", headers: headers

      expect(response).to have_http_status(:no_content)
      expect(Pipelines::Comment.exists?(reply.id)).to be(false)
    end

    it "responde 404 para comentário de outro card" do
      other = create(:pipeline_comment)

      delete "#{comments_path}/#{other.id}", headers: headers

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "fixar" do
    let(:comment) { create(:pipeline_comment, card: card, author: owner) }

    it "fixa e desfixa" do
      post "#{comments_path}/#{comment.id}/pin", headers: headers, as: :json
      expect(json).to include("pinned" => true)

      delete "#{comments_path}/#{comment.id}/pin", headers: headers
      expect(json).to include("pinned" => false)
    end
  end

  describe "reações" do
    let(:comment) { create(:pipeline_comment, card: card, author: owner) }
    let(:reactions_path) { "#{comments_path}/#{comment.id}/reactions" }

    it "reage uma vez só, sem duplicar" do
      post reactions_path, params: { emoji: "🎉" }, headers: headers, as: :json
      expect(response).to have_http_status(:created)

      post reactions_path, params: { emoji: "🎉" }, headers: headers, as: :json
      expect(response).to have_http_status(:ok)
      expect(json["reactions"]).to eq([ { "emoji" => "🎉", "count" => 1, "accountIds" => [ owner.id ] } ])
    end

    it "tira a reação" do
      comment.reactions.create!(user: owner, emoji: "🎉")

      delete reactions_path, params: { emoji: "🎉" }, headers: headers, as: :json

      expect(json["reactions"]).to eq([])
    end

    it "responde 422 sem emoji" do
      post reactions_path, params: { emoji: "" }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
    end

    it "transmite, para quem está com o card aberto" do
      stream = ApplicationCable::Channel.organization_stream(organization.id, PipelineBoardChannel.full_card_stream(board))
      comment

      expect { post reactions_path, params: { emoji: "🎉" }, headers: headers, as: :json }
        .to have_broadcasted_to(stream).with { |payload| expect(payload["event"]).to eq("comment_updated") }
    end
  end
end
