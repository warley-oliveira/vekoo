# Certificado de origem — NÃO versionar o conteúdo

Aqui ficam os dois arquivos que o `kamal-proxy` serve para `syco.vekoo.app`:

- `syco.vekoo.app.pem` — o certificado
- `syco.vekoo.app.key` — a chave privada

Hoje o certificado é autoassinado, com a zona da Cloudflare em **Full**. O comando que gera e como promover
para um *Origin Certificate* com **Full (strict)** estão em `DEPLOY.md`, seção 4.2.

O `.gitignore` da raiz ignora `*.pem` e `*.key` desta pasta. O Kamal lê os dois
via `.kamal/secrets` e faz o upload para o host a cada deploy — o certificado
não entra na imagem Docker.

Anote a data de expiração: ninguém avisa.
