require "rails_helper"

RSpec.describe Pipelines::Comment, type: :model do
  let(:organization) { create(:organization) }
  let(:user) { create(:account, organization: organization, name: "Marina") }
  let(:board) { create(:pipeline_board, organization: organization) }
  let(:stage) { create(:pipeline_stage, board: board) }
  let(:card) { create(:pipeline_card, stage: stage) }

  describe "autor" do
    it "vale só com uma pessoa" do
      expect(card.comments.build(body: "oi", author: user)).to be_valid
    end

    it "vale só com a automação" do
      expect(card.comments.build(body: "oi", automation_source: "script")).to be_valid
    end

    it "não vale sem nenhum" do
      comment = card.comments.build(body: "oi")

      expect(comment).not_to be_valid
      expect(comment.errors[:base]).to be_present
    end

    it "não vale com os dois" do
      comment = card.comments.build(body: "oi", author: user, automation_source: "script")

      expect(comment).not_to be_valid
      expect(comment.errors[:base]).to be_present
    end

    it "não vale com origem desconhecida" do
      expect(card.comments.build(body: "oi", automation_source: "assistente")).not_to be_valid
    end

    it "pessoa apagada não impede de mexer no comentário depois" do
      person = create(:account, organization: organization, role: "member")
      comment = card.comments.create!(body: "oi", author: person)

      person.destroy!

      expect(comment.reload.update(pinned: true)).to be(true)
    end
  end

  describe "autor na resposta" do
    it "pessoa" do
      comment = card.comments.create!(body: "humano", author: user)

      expect(Pipelines::CommentSerializer.author_payload(comment)).to include(type: "user", id: user.id, name: "Marina", email: user.email)
    end

    it "automação, no idioma de quem lê" do
      comment = card.comments.create!(body: "do script", automation_source: "script")

      expect(Pipelines::CommentSerializer.author_payload(comment)).to eq(type: "automation", source: "script", name: "Automação")
      I18n.with_locale(:en) do
        expect(Pipelines::CommentSerializer.author_payload(comment)).to include(name: "Automation")
      end
    end

    it "`nil` depois de apagar a pessoa" do
      person = create(:account, organization: organization, role: "member")
      comment = card.comments.create!(body: "oi", author: person)
      person.destroy!

      expect(Pipelines::CommentSerializer.author_payload(comment.reload)).to be_nil
    end
  end

  describe "atividade" do
    it "a da automação diz a origem, sem pessoa" do
      comment = card.comments.create!(body: "do script", automation_source: "script")
      activity = card.activities.find_by(action: "commented")

      expect(activity.account_id).to be_nil
      expect(activity.details).to include("source" => "script", "comment_id" => comment.id)
    end

    it "a da pessoa leva a pessoa, sem origem" do
      comment = card.comments.create!(body: "humano", author: user)
      activity = card.activities.find_by(action: "commented")

      expect(activity.account_id).to eq(user.id)
      expect(activity.details.keys).not_to include("source")
      expect(activity.details["comment_id"]).to eq(comment.id)
    end

    it "guarda só o começo do texto" do
      card.comments.create!(body: "x" * 1_000, author: user)

      expect(card.activities.find_by(action: "commented").details["body"].length).to be <= 100
    end
  end

  describe "respostas" do
    it "responder a uma resposta entra na mesma conversa" do
      root = card.comments.create!(body: "raiz", author: user)
      reply = card.comments.create!(body: "resposta", author: user, parent: root)

      deep = card.comments.create!(body: "mais uma", author: user, parent: reply)

      expect(deep.parent_id).to eq(root.id)
    end

    it "comentário de outro card não serve de pai" do
      other = create(:pipeline_comment)

      comment = card.comments.build(body: "resposta", author: user, parent_id: other.id)

      expect(comment).not_to be_valid
      expect(comment.errors[:parent_id]).to be_present
    end
  end

  describe "reação" do
    it "uma por pessoa e emoji" do
      comment = card.comments.create!(body: "oi", author: user)
      comment.reactions.create!(user: user, emoji: "👍")

      expect(comment.reactions.build(user: user, emoji: "👍")).not_to be_valid
      expect(comment.reactions.build(user: user, emoji: "🎉")).to be_valid
    end
  end
end
