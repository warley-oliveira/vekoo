import { useCalendarArea } from "@/components/calendar/area/area-context"
import { CollaboratorNoticesSection } from "@/components/calendar/settings/collaborator-notices-section"
import { ContactRemindersSection } from "@/components/calendar/settings/contact-reminders-section"
import { DetailsSection } from "@/components/calendar/settings/details-section"
import { GoogleSection } from "@/components/calendar/settings/google-section"

/**
 * As configurações de um calendário. Cada seção salva sozinha: dados com botão, interruptores na
 * hora, regras num modal. Calendário de turmas não tem colaboradores, então não há o que
 * distribuir nem a quem avisar. Excluir calendário não é oferecido: a API não tem essa rota.
 */
export default function SettingsPage() {
  const { calendar } = useCalendarArea()

  return (
    <div key={calendar.id} className="flex flex-col gap-6">
      <DetailsSection calendar={calendar} />
      <ContactRemindersSection calendar={calendar} />
      {calendar.calendarType === "professional" ? (
        <CollaboratorNoticesSection calendar={calendar} />
      ) : null}
      <GoogleSection calendar={calendar} />
    </div>
  )
}
