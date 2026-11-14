module References
  # As imagens de uma referência: conferidas na entrada, reduzidas para o
  # modelo que as analisa e para a miniatura do painel. Nenhuma delas vira
  # ativo de marca — moram anexadas ao card, e o original some depois da
  # análise.
  module Images
    MAX_FILES = 10
    MAX_BYTES = 10.megabytes
    # O lado maior que o modelo de visão aproveita; acima disso ele mesmo
    # reduz, e o excesso só custa upload.
    MODEL_PX = 1568
    THUMBNAIL_PX = 320

    class Invalid < StandardError; end

    module_function

    # Abre de verdade (não confia no content-type que veio) e devolve as
    # dimensões. Arquivo grande demais ou que o libvips não lê é recusado.
    def inspect!(data)
      raise Invalid, "tooLarge" if data.bytesize > MAX_BYTES

      image = Vips::Image.new_from_buffer(data, "")
      raise Invalid, "invalid" if image.width < 16 || image.height < 16

      { width: image.width, height: image.height }
    rescue Vips::Error
      raise Invalid, "invalid"
    end

    # O bloco `image` da mensagem ao modelo, em JPEG.
    def for_model(data)
      jpeg = resize(data, MODEL_PX, quality: 85)
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: Base64.strict_encode64(jpeg) } }
    end

    def thumbnail(data)
      resize(data, THUMBNAIL_PX, quality: 80)
    end

    def resize(data, size, quality:)
      image = Vips::Image.thumbnail_buffer(data, size, height: size, size: :down)
      image = image.flatten(background: [ 255, 255, 255 ]) if image.has_alpha?
      image.write_to_buffer(".jpg", Q: quality, strip: true)
    end
  end
end
