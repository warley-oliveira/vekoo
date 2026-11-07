# O Rails corrigido (CVE-2026-66066) se recusa a subir com libvips abaixo de 8.13, porque não há como
# bloquear os leitores não testados. É o que o apt do Ubuntu 22.04 oferece (8.12), e esse é o WSL de
# quem desenvolve aqui, onde não chega arquivo de fora.
#
# Vale só fora de produção. Em produção esta recusa é justamente o que protege, e a imagem traz uma
# libvips nova: ver `config/initializers/active_storage_hardening.rb`.
begin
  require "nokogiri" # Antes do libvips, que usa a mesma libxml2.
  require "ruby-vips"
rescue LoadError
  return
end

module Vips
  def self.block_untrusted(_value = true) = nil
end unless Vips.respond_to?(:block_untrusted)
