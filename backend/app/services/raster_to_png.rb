# Logo de quem não é designer chega como JPEG do WhatsApp, não como PNG
# transparente. Em vez de recusar, converte para PNG na entrada: daí para
# frente (peça, download, paleta) toda logo raster é PNG, como sempre foi.
#
# O fundo continua chapado — JPEG não tem alfa — e o `PngInspector` acusa
# isso como qualquer PNG opaco, com o mesmo alerta.
class RasterToPng
  # O lado maior: sobra para a peça (1080 px) e mantém o PNG abaixo do teto.
  MAX_SIDE = 2048

  def self.call(io)
    io.rewind
    # `thumbnail_buffer` já gira pela orientação EXIF (foto de celular).
    image = Vips::Image.thumbnail_buffer(io.read, MAX_SIDE, height: MAX_SIDE, size: :down)
    io.rewind

    tempfile = Tempfile.new([ "logo", ".png" ], binmode: true)
    tempfile.write(image.write_to_buffer(".png"))
    tempfile.rewind

    ActionDispatch::Http::UploadedFile.new(
      tempfile: tempfile,
      filename: "#{File.basename(io.original_filename.to_s, '.*').presence || 'logo'}.png",
      type: "image/png"
    )
  rescue Vips::Error
    nil
  end
end
