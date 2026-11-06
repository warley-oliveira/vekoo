import type { AttendanceSequence, ReminderPeriod, SequenceTrigger } from "@/lib/calendar/types"
import type { Language } from "@/lib/i18n"

// Os modelos prontos: conteúdo de partida, que a pessoa edita depois. Ficam aqui, por idioma, e não
// nos arquivos de tradução: as instruções levam variáveis literais ({{nome}}), que o i18next tentaria
// preencher, e isto é texto de quem usa, não da interface.

export type SequenceTemplate = {
  key: string
  trigger: SequenceTrigger
  stopOnReply: boolean
  steps: { runAfter: number; runAfterUnit: ReminderPeriod }[]
  content: Record<
    Language,
    {
      name: string
      description: string
      steps: { name: string; aiPrompt: string }[]
    }
  >
}

export const SEQUENCE_TEMPLATES: SequenceTemplate[] = [
  {
    key: "show_feedback",
    trigger: "show",
    stopOnReply: true,
    steps: [
      { runAfter: 2, runAfterUnit: "hours" },
      { runAfter: 1, runAfterUnit: "days" },
    ],
    content: {
      "pt-BR": {
        name: "Coleta de opinião",
        description: "Agradece a presença e pergunta como foi o atendimento.",
        steps: [
          {
            name: "Agradecimento e opinião",
            aiPrompt:
              "Agradeça {{nome}} pela presença no atendimento de {{servico}} com {{colaborador}} e pergunte, de forma cordial e breve, como foi a experiência.",
          },
          {
            name: "Reforço",
            aiPrompt:
              "Caso {{nome}} ainda não tenha respondido, reforce com gentileza o pedido de opinião sobre {{servico}} e coloque-se à disposição para ajudar.",
          },
        ],
      },
      en: {
        name: "Feedback collection",
        description: "Thanks the person for attending and asks how the appointment went.",
        steps: [
          {
            name: "Thanks and feedback",
            aiPrompt:
              "Thank {{nome}} for attending the {{servico}} appointment with {{colaborador}} and ask, politely and briefly, how the experience was.",
          },
          {
            name: "Follow-up",
            aiPrompt:
              "If {{nome}} has not replied yet, gently reinforce the feedback request about {{servico}} and offer to help.",
          },
        ],
      },
    },
  },
  {
    key: "show_next_step",
    trigger: "show",
    stopOnReply: false,
    steps: [{ runAfter: 3, runAfterUnit: "hours" }],
    content: {
      "pt-BR": {
        name: "Próximo passo",
        description: "Sugere o que a pessoa pode fazer depois do atendimento.",
        steps: [
          {
            name: "Sugestão de próximo passo",
            aiPrompt:
              "Parabenize {{nome}} pela presença em {{servico}} e apresente, de forma natural e sem insistir, o próximo passo recomendado.",
          },
        ],
      },
      en: {
        name: "Next step",
        description: "Suggests what the person can do after the appointment.",
        steps: [
          {
            name: "Next-step suggestion",
            aiPrompt:
              "Congratulate {{nome}} for attending {{servico}} and present, naturally and without being pushy, the recommended next step.",
          },
        ],
      },
    },
  },
  {
    key: "noshow_reactivation",
    trigger: "no_show",
    stopOnReply: true,
    steps: [
      { runAfter: 10, runAfterUnit: "minutes" },
      { runAfter: 1, runAfterUnit: "days" },
      { runAfter: 3, runAfterUnit: "days" },
    ],
    content: {
      "pt-BR": {
        name: "Recuperar e remarcar",
        description: "Três mensagens para retomar a conversa com quem faltou e marcar outro horário.",
        steps: [
          {
            name: "Primeiro contato",
            aiPrompt:
              "{{nome}} faltou ao agendamento de {{servico}}. Pergunte com empatia se está tudo bem e ofereça marcar um novo horário.",
          },
          {
            name: "Reforço do convite",
            aiPrompt:
              "Caso {{nome}} não tenha respondido, reforce o convite para remarcar {{servico}}, destacando os benefícios de forma acolhedora.",
          },
          {
            name: "Última tentativa",
            aiPrompt:
              "Última tentativa: pergunte se {{nome}} ainda tem interesse em {{servico}} e facilite ao máximo a remarcação.",
          },
        ],
      },
      en: {
        name: "Win back and rebook",
        description: "Three messages to restart the conversation with those who missed and book a new time.",
        steps: [
          {
            name: "First contact",
            aiPrompt:
              "{{nome}} missed the {{servico}} appointment. Empathetically ask if everything is okay and offer to book a new time.",
          },
          {
            name: "Reinforce the invitation",
            aiPrompt:
              "If {{nome}} has not replied, reinforce the invitation to rebook {{servico}}, warmly highlighting the benefits.",
          },
          {
            name: "Last attempt",
            aiPrompt:
              "Last attempt: ask whether {{nome}} is still interested in {{servico}} and make rebooking as easy as possible.",
          },
        ],
      },
    },
  },
  {
    key: "noshow_quick",
    trigger: "no_show",
    stopOnReply: false,
    steps: [{ runAfter: 5, runAfterUnit: "minutes" }],
    content: {
      "pt-BR": {
        name: "Lembrete rápido",
        description: "Uma única mensagem curta, logo depois da falta.",
        steps: [
          {
            name: "Mensagem rápida",
            aiPrompt:
              "{{nome}} não compareceu a {{servico}}. Envie uma mensagem curta e gentil perguntando se quer remarcar.",
          },
        ],
      },
      en: {
        name: "Quick reminder",
        description: "A single short message, right after the missed appointment.",
        steps: [
          {
            name: "Quick message",
            aiPrompt:
              "{{nome}} did not attend {{servico}}. Send a short, kind message asking whether they would like to reschedule.",
          },
        ],
      },
    },
  },
]

export function findTemplate(key: string | null, trigger: SequenceTrigger): SequenceTemplate | null {
  return SEQUENCE_TEMPLATES.find((item) => item.key === key && item.trigger === trigger) ?? null
}

/** Sem ids: quem dá é a API, ao salvar. A sequência só existe depois que a pessoa cria. */
export function sequenceFromTemplate(template: SequenceTemplate, language: Language): AttendanceSequence {
  const content = template.content[language]

  return {
    name: content.name,
    trigger: template.trigger,
    enabled: true,
    autoEnroll: false,
    stopOnReply: template.stopOnReply,
    ignoreAutomationPaused: false,
    reactivateAutomation: false,
    autoEnrollAnchors: ["attendance_mark"],
    autoEnrollMinutesAfterEnd: 60,
    steps: template.steps.map((timing, index) => ({
      name: content.steps[index]?.name ?? "",
      aiPrompt: content.steps[index]?.aiPrompt ?? "",
      runAfter: timing.runAfter,
      runAfterUnit: timing.runAfterUnit,
      timeFrom: 8,
      timeAt: 18,
      allDay: false,
    })),
  }
}
