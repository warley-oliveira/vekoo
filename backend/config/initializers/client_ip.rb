# De onde sai `request.remote_ip`, que é o que limita tentativa por padrão (`rate_limit`) e o que a
# sessão guarda. Em produção a requisição chega assim: pessoa -> Cloudflare -> kamal-proxy -> Puma.
#
# Duas coisas para esse valor querer dizer "a pessoa":
#
# 1. Só `X-Forwarded-For`. Desde o Rails 8.1 o endereço sai do `forwarded_for` do Rack, que prefere o
#    cabeçalho `Forwarded`. Nenhum dos dois proxies mexe nele, então era o cliente quem escolhia o próprio
#    IP, e trocar o valor a cada tentativa zerava todo limite por IP (GHSA-2gff-2mmg-m73p).
#
# 2. A Cloudflare entra na lista de quem é confiável. Sem ela o último endereço da fila é o da borda: todo
#    mundo que sai pelo mesmo endereço da Cloudflare divide o limite, e uma pessoa errando a senha corta o
#    login das outras. A lista substitui o padrão, por isso as faixas internas vêm junto.
#    Fonte: https://www.cloudflare.com/ips/ (raramente muda; faixa nova só devolve o comportamento antigo).
Rack::Request.forwarded_priority = [ :x_forwarded ]

Rails.application.config.action_dispatch.trusted_proxies = ActionDispatch::RemoteIp::TRUSTED_PROXIES + %w[
  173.245.48.0/20 103.21.244.0/22 103.22.200.0/22 103.31.4.0/22 141.101.64.0/18 108.162.192.0/18
  190.93.240.0/20 188.114.96.0/20 197.234.240.0/22 198.41.128.0/17 162.158.0.0/15 104.16.0.0/13
  104.24.0.0/14 172.64.0.0/13 131.0.72.0/22
  2400:cb00::/32 2606:4700::/32 2803:f800::/32 2405:b500::/32 2405:8100::/32 2a06:98c0::/29 2c0f:f248::/32
].map { |range| IPAddr.new(range) }
