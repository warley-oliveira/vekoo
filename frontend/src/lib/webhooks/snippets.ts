// Os exemplos que a pessoa copia. A chave nunca entra aqui: é sempre o nome de uma variável, porque a tela não a tem
// mais depois da primeira vez, e porque exemplo com segredo acaba colado em algum lugar.

/** O corpo vai entre aspas simples no shell: aspas simples dentro dele precisam de escape. */
function shellQuote(text: string): string {
  return `'${text.replace(/'/g, `'\\''`)}'`
}

/** Sem assinatura: o que qualquer um cola num terminal para ver a requisição chegar. */
export function curlExample(url: string, body: string): string {
  return [`curl -X POST ${shellQuote(url)} \\`, `  -H "Content-Type: application/json" \\`, `  -d ${shellQuote(compactJson(body))}`].join("\n")
}

export function signedCurlExample(url: string, body: string, secretVariable: string): string {
  return [
    `URL=${shellQuote(url)}`,
    `BODY=${shellQuote(compactJson(body))}`,
    `TS=$(date +%s)`,
    `SIG=$(printf '%s.%s' "$TS" "$BODY" | openssl dgst -sha256 -hmac "$${secretVariable}" -hex | sed 's/^.* //')`,
    ``,
    `curl -X POST "$URL" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -H "X-Vekoo-Timestamp: $TS" \\`,
    `  -H "X-Vekoo-Signature: sha256=$SIG" \\`,
    `  -d "$BODY"`,
  ].join("\n")
}

export function signedNodeExample(url: string, secretVariable: string): string {
  return [
    `const crypto = require("crypto")`,
    ``,
    `const timestamp = Math.floor(Date.now() / 1000)`,
    `const body = JSON.stringify(payload)`,
    ``,
    `const signature = crypto`,
    `  .createHmac("sha256", process.env.${secretVariable})`,
    `  .update(\`\${timestamp}.\${body}\`)`,
    `  .digest("hex")`,
    ``,
    `await fetch(${JSON.stringify(url)}, {`,
    `  method: "POST",`,
    `  headers: {`,
    `    "Content-Type": "application/json",`,
    `    "X-Vekoo-Timestamp": String(timestamp),`,
    `    "X-Vekoo-Signature": \`sha256=\${signature}\`,`,
    `  },`,
    `  body,`,
    `})`,
  ].join("\n")
}

function compactJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text))
  } catch {
    return text
  }
}
