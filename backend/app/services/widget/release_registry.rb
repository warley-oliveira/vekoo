# frozen_string_literal: true

module Widget
  # Leitura do config/widget_releases.yml — o catálogo de versões pináveis do
  # widget.
  #
  # Existe para que a plataforma nunca gere um snippet com `integrity` sem ter
  # o hash correspondente revisado em código. Se a versão não está aqui, ela
  # não é oferecida.
  class ReleaseRegistry
    CONFIG_PATH = Rails.root.join('config/widget_releases.yml')

    ROLLING = 'rolling'
    PINNED  = 'pinned'
    DELIVERY_MODES = [ROLLING, PINNED].freeze

    # Formato do hash SRI aceito. Só sha384 — sha256 é fraco demais para o uso
    # e sha512 não traz ganho prático aqui; fixar um formato evita entrada torta.
    SRI_FORMAT = %r{\Asha384-[A-Za-z0-9+/]{64}={0,2}\z}

    class << self
      def releases
        data['releases'] || {}
      end

      # Versões conhecidas, da mais nova para a mais antiga.
      def versions
        releases.keys.sort_by { |v| Gem::Version.new(v) }.reverse
      rescue ArgumentError
        releases.keys.sort.reverse
      end

      def known?(version)
        version.present? && releases.key?(version.to_s)
      end

      def release(version)
        releases[version.to_s]
      end

      def sri(version)
        release(version)&.fetch('sri', nil)
      end

      # Versão sugerida como padrão no admin. Cai para a mais recente se o
      # `stable` do YAML apontar para algo que não existe.
      def stable_version
        candidate = data['stable'].to_s
        known?(candidate) ? candidate : versions.first
      end

      def rolling_filename
        data['rolling_filename'].presence || 'widget.v1.js'
      end

      # Caminho relativo do artefato imutável. Espelha o layout produzido por
      # aiva-frontend/widget/scripts/release.mjs (pinados vivem em /v/ para não
      # colidirem com a regra de cache do canal rolling).
      def pinned_path(version)
        "v/widget.#{version}.js"
      end

      # Catálogo para o admin: versão, hash e data, já ordenado.
      def catalog
        versions.map do |version|
          entry = release(version)
          {
            version: version,
            sri: entry['sri'],
            released_at: entry['released_at'],
            notes: entry['notes']
          }
        end
      end

      def reload!
        @data = nil
        data
      end

      private

      def data
        @data ||= load_config
      end

      def load_config
        return {} unless CONFIG_PATH.exist?

        parsed = YAML.safe_load(CONFIG_PATH.read, permitted_classes: [Date]) || {}
        validate!(parsed)
        parsed
      end

      # Falha alto e cedo: um SRI malformado no YAML viraria um `integrity`
      # quebrado na página do cliente, e o sintoma seria "o widget sumiu".
      def validate!(parsed)
        (parsed['releases'] || {}).each do |version, entry|
          sri = entry.is_a?(Hash) ? entry['sri'].to_s : ''
          next if sri.match?(SRI_FORMAT)

          raise "widget_releases.yml: SRI inválido para a versão #{version.inspect} (#{sri.inspect})"
        end
      end
    end
  end
end
