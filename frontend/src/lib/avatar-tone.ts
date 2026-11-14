// O tom das iniciais de um contato: um dos oito `avatar-*` do tema, sempre o mesmo para o mesmo id.
// As classes vão escritas por inteiro para o Tailwind encontrá-las. `ring` é o aro de quem tem
// mensagem não lida: no tom do próprio contato, e não no violeta, que é da seleção.

const TONES = [
  { fill: "bg-avatar-1 text-avatar-1-foreground", ring: "ring-2 ring-avatar-1-foreground/60 ring-offset-2 ring-offset-background" },
  { fill: "bg-avatar-2 text-avatar-2-foreground", ring: "ring-2 ring-avatar-2-foreground/60 ring-offset-2 ring-offset-background" },
  { fill: "bg-avatar-3 text-avatar-3-foreground", ring: "ring-2 ring-avatar-3-foreground/60 ring-offset-2 ring-offset-background" },
  { fill: "bg-avatar-4 text-avatar-4-foreground", ring: "ring-2 ring-avatar-4-foreground/60 ring-offset-2 ring-offset-background" },
  { fill: "bg-avatar-5 text-avatar-5-foreground", ring: "ring-2 ring-avatar-5-foreground/60 ring-offset-2 ring-offset-background" },
  { fill: "bg-avatar-6 text-avatar-6-foreground", ring: "ring-2 ring-avatar-6-foreground/60 ring-offset-2 ring-offset-background" },
  { fill: "bg-avatar-7 text-avatar-7-foreground", ring: "ring-2 ring-avatar-7-foreground/60 ring-offset-2 ring-offset-background" },
  { fill: "bg-avatar-8 text-avatar-8-foreground", ring: "ring-2 ring-avatar-8-foreground/60 ring-offset-2 ring-offset-background" },
] as const

export type AvatarTone = (typeof TONES)[number]

/** FNV-1a: curto, estável e bem espalhado para ids e telefones parecidos entre si. */
function hash(seed: string): number {
  let value = 0x811c9dc5
  for (let index = 0; index < seed.length; index += 1) {
    value ^= seed.charCodeAt(index)
    value = Math.imul(value, 0x01000193)
  }
  return value >>> 0
}

export function avatarTone(seed: string): AvatarTone {
  return TONES[hash(seed) % TONES.length]
}
