# Certificado de origem — NÃO versionar o conteúdo

Aqui ficam os dois arquivos gerados pela Cloudflare em
**SSL/TLS → Origin Server → Create Certificate** para `syco.vekoo.app`:

- `syco.vekoo.app.pem` — Origin Certificate (o bloco `CERTIFICATE`)
- `syco.vekoo.app.key` — Private Key (o bloco `PRIVATE KEY`)

O `.gitignore` da raiz ignora `*.pem` e `*.key` desta pasta. O Kamal lê os dois
via `.kamal/secrets` e faz o upload para o host a cada deploy — o certificado
não entra na imagem Docker.

Validade padrão: 15 anos. Anote a data de expiração; a Cloudflare não avisa.
