# GET /catalog — o acervo da ferramenta (temas, imagens, paletas, formatos e o
# custo das gerações). Igual para todo mundo, então não exige sessão: a tela de
# entrada já usa parte dele.
class CatalogController < ApplicationController
  def show
    render json: CatalogSerializer.call
  end
end
