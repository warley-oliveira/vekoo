require "ferrum"

module PieceRenderers
  # O renderizador do navegador: abre a rota `/render` do próprio front (o
  # mesmo React do preview) num Chromium sem tela, espera fontes e imagens e
  # tira o PNG de cada lâmina pelo recorte exato do canvas.
  #
  # Um navegador por processo, reaproveitado e serializado por mutex — abrir
  # um Chromium por peça custaria segundos e centenas de MB a cada vez.
  module Chromium
    READY_TIMEOUT = 25
    RECYCLE_AFTER = 200

    @mutex = Mutex.new
    @browser = nil
    @uses = 0

    module_function

    def available? = ENV["FRONTEND_URL"].present? && browser_path.present?

    def browser_path
      ENV["CHROME_PATH"].presence || %w[/usr/bin/chromium /usr/bin/chromium-browser /usr/bin/google-chrome].find { |path| File.exist?(path) }
    end

    # { posição => png } das lâminas pedidas.
    def render(version, positions:)
      raise Failed, "Chromium não configurado (FRONTEND_URL e CHROME_PATH)" unless available?

      canvas = version.document["canvas"]
      url = "#{ENV.fetch("FRONTEND_URL").chomp("/")}/render?version=#{version.id}&token=#{CGI.escape(PieceRenderers.render_token(version))}"

      @mutex.synchronize do
        page = browser.create_page
        begin
          # A janela do tamanho de todas as lâminas empilhadas: recorte fora
          # da janela sai em branco.
          slides = version.document["slides"].length
          page.set_viewport(width: canvas["width"], height: canvas["height"] * slides, scale_factor: 1)
          page.go_to(url)
          wait_ready(page)
          positions.to_h { |position| [ position, shoot(page, position) ] }
        ensure
          page.close
          recycle!
        end
      end
    end

    def wait_ready(page)
      deadline = Time.current + READY_TIMEOUT
      loop do
        status = page.evaluate("window.__vekooRender && window.__vekooRender.status")
        return if status == "ready"
        raise Failed, "a página de render falhou: #{page.evaluate('window.__vekooRender.error')}" if status == "error"
        raise Failed, "a página de render não ficou pronta em #{READY_TIMEOUT}s" if Time.current > deadline

        sleep 0.1
      end
    end

    def shoot(page, position)
      box = page.evaluate(<<~JS)
        (() => { const r = document.querySelector('[data-slide-index="#{position.to_i}"]').getBoundingClientRect();
                 return { x: r.x + window.scrollX, y: r.y + window.scrollY, width: r.width, height: r.height } })()
      JS
      raise Failed.new("lâmina #{position + 1} não apareceu", slide: position) unless box

      Base64.decode64(page.screenshot(encoding: :base64, format: "png", area: box.symbolize_keys))
    end

    def browser
      @browser ||= Ferrum::Browser.new(
        browser_path: browser_path, headless: true, timeout: READY_TIMEOUT,
        browser_options: { "no-sandbox" => nil, "disable-dev-shm-usage" => nil, "hide-scrollbars" => nil, "font-render-hinting" => "none" }
      )
    end

    def recycle!
      @uses += 1
      return if @uses < RECYCLE_AFTER

      @browser&.quit
      @browser = nil
      @uses = 0
    end
  end
end
