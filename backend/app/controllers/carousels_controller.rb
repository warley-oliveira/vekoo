# Os carrosséis da organização — a biblioteca, a lixeira e o editor.
#
# A listagem devolve **resumo** (só o card 1) porque a grade não desenha o
# documento inteiro; `show` devolve o documento completo, que é o que o editor
# abre.
class CarouselsController < AuthenticatedController
  before_action :set_carousel, except: %i[index create]

  # GET /carousels?trashed=&folder_id=&favorite=&q=&sort=
  # `sort` aceita recent (padrão), oldest, title e created.
  def index
    render json: { carousels: CarouselSerializer.many_summaries(scoped_carousels) }
  end

  def show
    render json: CarouselSerializer.one(@carousel)
  end

  def create
    carousel = current_organization.carousels.new(carousel_params)
    carousel.theme = default_theme if carousel.theme.blank?
    carousel.edited_at = Time.current

    if carousel.save
      render json: CarouselSerializer.one(carousel), status: :created
    else
      render_invalid(carousel)
    end
  end

  # Salvamento grosso do editor: o documento inteiro de uma vez (o histórico de
  # desfazer é da tela, não do servidor).
  def update
    @carousel.assign_attributes(carousel_params)
    @carousel.edited_at = Time.current if document_changed?

    if @carousel.save
      render json: CarouselSerializer.one(@carousel)
    else
      render_invalid(@carousel)
    end
  end

  # Apagar é mandar para a lixeira — nada some sem passar por lá.
  def destroy
    @carousel.trash!
    render json: CarouselSerializer.one(@carousel)
  end

  def duplicate
    copy = DuplicateCarousel.new(@carousel, title: params[:title]).call
    render json: CarouselSerializer.one(copy), status: :created
  end

  def restore
    @carousel.restore!
    render json: CarouselSerializer.one(@carousel)
  end

  # DELETE /carousels/:id/permanent — aqui sim some para sempre.
  def destroy_permanently
    @carousel.destroy!
    head :no_content
  end

  private

  def set_carousel
    @carousel = current_organization.carousels.find(params[:id])
  end

  def scoped_carousels
    list = current_organization.carousels

    if ActiveModel::Type::Boolean.new.cast(params[:trashed])
      purge_expired_trash
      list = list.trashed.trashed_first
    else
      list = list.active
      # `sort` só vale para a biblioteca: na lixeira o que importa é o que está
      # prestes a sumir, e isso é sempre a ordem de quando foi jogado fora.
      list = params[:sort].present? ? list.sorted_by(params[:sort]) : list.recent_first
    end

    list = list.where(favorite: true) if ActiveModel::Type::Boolean.new.cast(params[:favorite])
    list = list.where(folder_id: params[:folder_id]) if params[:folder_id].present?
    list = list.where("title ILIKE ?", "%#{sanitize_like(params[:q])}%") if params[:q].present?
    list
  end

  # A tela promete que o que está na lixeira some em 30 dias. Sem agendador,
  # quem cumpre a promessa é quem abre a lixeira — barato (um DELETE indexado)
  # e honesto: ninguém vê um item que já deveria ter sumido.
  def purge_expired_trash
    current_organization.carousels.expired_trash.destroy_all
  end

  def sanitize_like(term)
    ActiveRecord::Base.sanitize_sql_like(term.to_s.strip)
  end

  def carousel_params
    permitted = params.require(:carousel).permit(
      :title, :format, :caption, :favorite, :folderId,
      theme: {},
      cards: []
    )
    permitted[:folder_id] = permitted.delete(:folderId) if permitted.key?(:folderId)
    permitted[:cards] = raw_cards if params[:carousel].key?(:cards)
    permitted
  end

  # Os cards são documento livre (blocos aninhados, formato de lib/doc.ts):
  # `permit` não tem como enumerar essa árvore, então ela entra inteira — o que
  # a protege é a validação do modelo, não uma lista de campos.
  def raw_cards
    params[:carousel][:cards].map { |card| card.permit!.to_h }
  end

  def document_changed?
    (@carousel.changed & %w[title format theme cards caption]).any?
  end

  # Carrossel novo nasce com o primeiro tema pronto do catálogo.
  def default_theme
    ThemePreset.ordered.first&.theme || {
      "bg" => "oklch(0.97 0.005 90)",
      "surface" => "oklch(0.93 0.008 90)",
      "ink" => "oklch(0.2 0.01 285)",
      "accent" => "oklch(0.5 0.2 292)",
      "accentInk" => "oklch(0.98 0.005 292)"
    }
  end
end
