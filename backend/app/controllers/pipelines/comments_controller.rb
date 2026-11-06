module Pipelines
  class CommentsController < BaseController
    PER_PAGE = 20

    before_action :set_board
    before_action :set_card
    before_action :set_comment, only: %i[update destroy pin unpin add_reaction remove_reaction]

    # A tela mostra em ordem de conversa, com "carregar anteriores" no topo. Cada página traz os mais
    # recentes que ainda não vieram, em ordem cronológica. Os fixados vêm à parte, na primeira página,
    # porque ficam no alto seja qual for a data. `?before=<nextCursor>` pede a página anterior.
    #
    # A origem ordenava do mais velho para o mais novo e paginava com `created_at < cursor`: a página 2
    # repetia a 1, e do 21º comentário em diante nada aparecia.
    def index
      before = parse_cursor(params[:before])
      regular = page_scope(before).order(created_at: :desc).limit(PER_PAGE + 1).to_a
      has_more = regular.size > PER_PAGE
      regular = regular.first(PER_PAGE)
      pinned = before ? [] : roots.where(pinned: true).chronological.includes(CommentSerializer::PRELOADS_WITH_REPLIES).to_a

      render json: {
        pinned: pinned.map { |comment| CommentSerializer.one(comment, with_replies: true) },
        comments: regular.reverse.map { |comment| CommentSerializer.one(comment, with_replies: true) },
        hasMore: has_more,
        nextCursor: has_more ? regular.last.created_at.utc.iso8601(6) : nil,
        totalCount: @card.comments.count
      }
    end

    # JSON: { comment: { body, parentId? } }. Com anexo, multipart: comment[body], comment[files][].
    def create
      attributes = envelope(:comment)
      files = real_files(attributes[:files])
      return render_too_many_files if files.size > Pipelines::MAX_FILES_PER_COMMENT

      comment = @card.comments.build(attributes.permit(:body, :parent_id).merge(author: current_account))

      Comment.transaction do
        comment.save!
        files.each { |file| comment.attachments.create!(file: file) }
      end

      render json: CommentSerializer.one(comment.reload, with_replies: true), status: :created
    end

    # Só quem escreveu.
    def update
      return render_forbidden unless @comment.account_id.present? && @comment.account_id == current_account.id

      if @comment.update(body: envelope(:comment)[:body], edited_at: Time.current)
        render json: CommentSerializer.one(@comment.reload, with_replies: true)
      else
        render_invalid(@comment)
      end
    end

    def destroy
      @comment.destroy!
      head :no_content
    end

    def pin
      @comment.update!(pinned: true)
      render json: CommentSerializer.one(@comment.reload, with_replies: true)
    end

    def unpin
      @comment.update!(pinned: false)
      render json: CommentSerializer.one(@comment.reload, with_replies: true)
    end

    # { emoji }. Idempotente: reagir de novo com o mesmo emoji não muda nada e responde 200.
    def add_reaction
      reaction = @comment.reactions.find_or_initialize_by(account_id: current_account.id, emoji: params[:emoji].to_s)
      created = reaction.new_record?

      if created && !reaction.save
        return render_invalid(reaction)
      end

      @comment.reload.broadcast_reactions_changed if created
      render json: CommentSerializer.one(@comment.reload, with_replies: true), status: created ? :created : :ok
    end

    def remove_reaction
      removed = @comment.reactions.where(account_id: current_account.id, emoji: params[:emoji].to_s).destroy_all
      @comment.reload.broadcast_reactions_changed if removed.any?

      render json: CommentSerializer.one(@comment.reload, with_replies: true)
    end

    private

    def roots
      @card.comments.roots
    end

    def page_scope(before)
      scope = roots.where(pinned: false).includes(CommentSerializer::PRELOADS_WITH_REPLIES)
      before ? scope.where("pipeline_comments.created_at < ?", before) : scope
    end

    def set_comment
      @comment = @card.comments.find(params[:id])
    end

    # Cursor que não é data: como se não tivesse vindo.
    def parse_cursor(value)
      value.present? ? Time.iso8601(value.to_s) : nil
    rescue ArgumentError
      nil
    end

    def render_too_many_files
      render_error(
        status: :unprocessable_content,
        code: "tooManyFiles",
        field: "files",
        message: t("pipelines.comments.too_many_files", max: Pipelines::MAX_FILES_PER_COMMENT)
      )
    end
  end
end
