# Um pedido de imagem em segundo plano: cada imagem leva de 5 a 30 s no
# gerador, e segurar uma thread do Puma por isso travaria a API.
class GenerateImagesJob < ApplicationJob
  queue_as :default

  def perform(generation_id)
    generation = ImageGeneration.find_by(id: generation_id)
    Images::Generate.new(generation).call if generation&.pending?
  end
end
