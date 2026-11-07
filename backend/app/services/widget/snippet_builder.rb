# frozen_string_literal: true

module Widget
  # Monta o snippet de instalação do widget para uma integração.
  #
  # Dois modos:
  #
  #   rolling — comportamento histórico. Carrega widget.v1.js (sempre a última
  #             versão) via injeção programática de <script>. É o default e a
  #             saída é BYTE A BYTE a mesma de sempre: existe cliente com esse
  #             HTML colado em produção, e mudar qualquer caractere aqui é
  #             mudar o que já está instalado. Ver o spec de golden string.
  #
  #   pinned  — versão congelada com Subresource Integrity. Vira uma tag
  #             <script src> literal (auditável pelo time de segurança do
  #             cliente, e o navegador aplica o integrity de forma declarativa).
  #             Se o arquivo no CDN mudar um único byte, o navegador se recusa
  #             a executar. É a resposta ao medo de "script trocado no CDN".
  #
  # O bloco inline com o stub `window.aiva` é idêntico nos dois modos em
  # conteúdo funcional, mas o hash CSP é derivado do texto realmente emitido
  # (ver #csp_script_hash) — nunca de uma constante que possa divergir.
  class SnippetBuilder
    def self.widget_base_url
      Rails.application.config.try(:widget_base_url) ||
        ENV.fetch("WIDGET_BASE_URL", "https://widget.vekoo.app")
    end

    # Origem que o widget contacta em runtime (API + ActionCable). Precisa
    # bater com DEFAULT_API_BASE do bundle (widget/src/index.ts).
    def self.api_base_url
      Rails.application.config.try(:widget_api_base_url) ||
        ENV.fetch("WIDGET_API_BASE_URL") { Media::Storage.backend_url }
    end

    # Origem dos anexos/avatares servidos ao widget.
    def self.assets_base_url
      Rails.application.config.try(:widget_assets_base_url) ||
        ENV.fetch("WIDGET_ASSETS_BASE_URL") { Media::Storage.backend_url }
    end

    def initialize(connector, base_url: self.class.widget_base_url)
      @connector = connector
      @base_url = base_url.to_s.chomp("/")
    end

    # nil quando a integração ainda não tem token (nada a instalar).
    def call
      return nil unless public_token

      pinned? ? pinned_snippet : rolling_snippet
    end

    def pinned?
      connector.try(:delivery_mode) == ReleaseRegistry::PINNED && sri.present?
    end

    def version
      return nil unless pinned?

      connector.pinned_version
    end

    def sri
      ReleaseRegistry.sri(connector.try(:pinned_version))
    end

    # Hash para o `script-src` do CSP do cliente, calculado sobre o conteúdo
    # exato do bloco inline emitido — assim não há como o snippet e o hash
    # divergirem.
    def csp_script_hash
      return nil unless public_token

      "'sha256-#{Digest::SHA256.base64digest(inline_script_body)}'"
    end

    # Diretivas prontas para o cliente colar na CSP dele.
    #
    # style-src ainda exige 'unsafe-inline' porque o widget injeta um <style>
    # dentro do Shadow DOM. Documentado como limitação conhecida.
    def csp_directives
      return nil unless public_token

      api = self.class.api_base_url
      {
        "script-src" => [ base_url, csp_script_hash ].compact.join(" "),
        "connect-src" => "#{api} #{api.sub(/\Ahttp/i, 'ws')}",
        "img-src" => "#{self.class.assets_base_url} data:",
        "media-src" => "#{self.class.assets_base_url} data:",
        "style-src" => "'unsafe-inline'"
      }
    end

    def csp_header
      return nil unless public_token

      csp_directives.map { |directive, value| "#{directive} #{value}" }.join("; ")
    end

    private

    attr_reader :connector, :base_url

    def public_token
      connector.public_token
    end

    def rolling_url
      "#{base_url}/#{ReleaseRegistry.rolling_filename}"
    end

    def pinned_url
      "#{base_url}/#{ReleaseRegistry.pinned_path(version)}"
    end

    # ATENÇÃO: saída congelada. Ver spec/services/widget/snippet_builder_spec.rb.
    #
    # A primeira linha define o stub da fila de comandos window.aiva, para a
    # página do cliente poder chamar aiva('open'), aiva('setContext') etc.
    # antes do bundle carregar (ver widget/INTEGRATION.md).
    def rolling_snippet
      <<~HTML.strip
        <script>
          window.aiva = window.aiva || function(){(window.aiva.q = window.aiva.q || []).push(arguments)};
          (function(d,s,p){var w=d.createElement(s);w.async=1;
          w.src='#{rolling_url}';
          w.dataset.pk=p; d.head.appendChild(w);})
          (document,'script','#{public_token}');
        </script>
      HTML
    end

    # Tag literal em vez de injeção programática: o cliente consegue ler o que
    # vai carregar, e integrity/crossorigin são aplicados pelo navegador antes
    # de qualquer execução. crossorigin="anonymous" é obrigatório para o SRI —
    # sem CORS o navegador nem chega a comparar o hash.
    def pinned_snippet
      <<~HTML.strip
        <script>#{stub_only_body}</script>
        <script
          src="#{pinned_url}"
          integrity="#{sri}"
          crossorigin="anonymous"
          data-pk="#{public_token}"
          async></script>
      HTML
    end

    def stub_only_body
      "\n  #{STUB_JS}\n"
    end

    STUB_JS = "window.aiva = window.aiva || function(){(window.aiva.q = window.aiva.q || []).push(arguments)};"

    # Conteúdo do primeiro bloco <script> do snippet, extraído da saída real.
    def inline_script_body
      snippet = call.to_s
      snippet[%r{\A<script>(.*?)</script>}m, 1].to_s
    end
  end
end
