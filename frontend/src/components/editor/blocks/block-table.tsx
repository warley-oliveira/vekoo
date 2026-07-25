import type { CarouselTheme, TableBlock } from "@/lib/doc"

/** Tabela simples: linha 0 é o cabeçalho. Bordas na tinta do card. */
export function TableBlockView({ block }: { block: TableBlock; theme: CarouselTheme }) {
  const [header, ...rows] = block.rows
  if (!header) return null

  return (
    <table className="w-full border-collapse text-[3.7cqw] leading-[1.3]">
      <thead>
        <tr>
          {header.map((cell, i) => (
            <th
              key={i}
              className="border-b-[0.5cqw] border-current/40 pr-[2.5cqw] pb-[1.7cqw] text-left font-semibold last:pr-0"
            >
              {cell}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, ri) => (
          <tr key={ri}>
            {row.map((cell, ci) => (
              <td
                key={ci}
                className="border-b-[0.3cqw] border-current/15 py-[1.8cqw] pr-[2.5cqw] last:pr-0"
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
