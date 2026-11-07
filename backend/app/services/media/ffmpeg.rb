# frozen_string_literal: true

module Media
  # As opções que vão antes do `-i` quando o arquivo veio de fora. O ffmpeg escolhe o que fazer olhando o
  # conteúdo, e um "áudio" que é na verdade uma playlist HLS manda ele abrir outro arquivo do servidor, e o
  # que sai vira uma mensagem na conversa. Passar sem shell evita injeção de comando, mas não isso.
  module Ffmpeg
    # Os contêineres de áudio que navegadores e WhatsApp produzem. Fora daqui o ffmpeg recusa antes de abrir
    # qualquer coisa: é o que corta `hls`, `concat`, `dash` e o resto dos que seguem referências.
    AUDIO_DEMUXERS = %w[matroska webm ogg mov mp4 m4a 3gp mp3 wav aac flac amr].freeze

    # Em segundos de CPU. Áudio de 16 MB converte em poucos segundos; um arquivo feito para travar não
    # segura a thread do Puma para sempre.
    MAX_CPU_SECONDS = 120

    AUDIO_INPUT = [
      "-timelimit", MAX_CPU_SECONDS.to_s,
      "-protocol_whitelist", "file",
      "-format_whitelist", AUDIO_DEMUXERS.join(",")
    ].freeze
  end
end
