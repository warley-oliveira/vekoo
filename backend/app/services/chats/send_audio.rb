require "open3"

module Chats
  # O áudio que a pessoa grava na tela: converte para o que o canal aceita, guarda, registra no
  # histórico, pausa a automação e envia.
  #
  # Sem tabela própria: a origem tinha `AudioAttachment` para dizer de quem era o arquivo, e aqui o
  # arquivo pertence só à mensagem (`media_blob_id`, ver Media::Storage), como o áudio recebido.
  class SendAudio
    # O teto do WhatsApp para áudio.
    MAX_BYTES = 16.megabytes

    class FileMissing < StandardError; end
    class FileTooLarge < StandardError; end
    class ConversionFailed < StandardError; end

    Converted = Struct.new(:path, :filename, :content_type, :temporary, keyword_init: true)

    # @param file [#read, #tempfile] o arquivo do navegador
    # @return [ChatMessage::Audio] `failed` se o canal recusou, com o motivo
    # @raise [FileMissing, FileTooLarge, ConversionFailed]
    def self.call(chat:, account:, file:)
      new(chat, account, file).call
    end

    def initialize(chat, account, file)
      @chat = chat
      @account = account
      @file = file
    end

    def call
      raise FileMissing unless file.respond_to?(:read) && file.respond_to?(:tempfile)
      raise FileTooLarge if file.size > MAX_BYTES

      converted = convert
      blob = Media::Storage.store_file(converted.path, filename: converted.filename, content_type: converted.content_type)

      message = ChatMessage::Audio.create!(
        role: "assistant",
        audio_url: Media::Storage.path_for(blob),
        media_blob_id: blob.id.to_s,
        chat: chat,
        sender_name: account.name,
        account_id: account.id,
        message_origin: "frontend",
        status: "pending"
      )

      chat.updated_by_account = account
      chat.pause_automation_for_human!

      deliver(message, blob)
      message
    ensure
      FileUtils.rm_f(converted.path) if converted&.temporary
    end

    private

    attr_reader :chat, :account, :file

    def deliver(message, blob)
      response = chat.connector.send_audio_message_by_url(chat.phone_number, Media::Storage.public_url(Media::Storage.path_for(blob)), chat)

      # O SDK da Meta não levanta: a recusa vem dentro da resposta.
      error = response.try(:error)
      return message.update(status: "failed", status_message: error.message) if error

      message.update(message_id: Connectors::ExternalId.from(response), status: "delivery_ack")
    rescue StandardError => e
      Rails.logger.error("[Chats::SendAudio] #{e.class}: #{e.message}")
      message.update(status: "failed", status_message: Connectors::SendFailure.reason(e))
    end

    # A API oficial aceita mp3; os outros canais tocam como áudio gravado em ogg/opus.
    def convert
      if chat.connector.is_a?(Connector::WhatsappCloud)
        transcode(".mp3", "audio/mpeg", %w[-c:a libmp3lame -b:a 64k])
      else
        transcode(".ogg", "audio/ogg", %w[-c:a libopus -b:a 32k -vbr on])
      end
    end

    # Sem ffmpeg na máquina vai o original: melhor um formato ruim do que perder a mensagem, a mesma
    # regra do áudio recebido na WABA. O ffmpeg que roda e falha é outra coisa: o arquivo não presta.
    def transcode(extension, content_type, codec_args)
      target = Rails.root.join("tmp", "audio-#{SecureRandom.hex(8)}#{extension}").to_s
      command = [ "ffmpeg", "-y", "-loglevel", "error", "-i", file.tempfile.path, "-map", "0:a:0", "-ac", "1", "-ar", "48000",
                  *codec_args, "-avoid_negative_ts", "make_zero", target ]

      _output, status = Open3.capture2e(*command)
      unless status.success?
        FileUtils.rm_f(target)
        raise ConversionFailed
      end

      Converted.new(path: target, filename: "audio#{extension}", content_type: content_type, temporary: true)
    rescue Errno::ENOENT
      Rails.logger.warn("[Chats::SendAudio] ffmpeg indisponível: enviando o áudio original")
      Converted.new(path: file.tempfile.path, filename: file.original_filename, content_type: file.content_type, temporary: false)
    end
  end
end
