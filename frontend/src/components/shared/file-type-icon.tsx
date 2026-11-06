import {
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  type LucideIcon,
  type LucideProps,
} from "lucide-react"

import { getFileKind, type FileKind } from "@/lib/file-utils"

const ICONS: Record<FileKind, LucideIcon> = {
  image: FileImage,
  video: FileVideo,
  audio: FileAudio,
  pdf: FileText,
  code: FileCode,
  text: FileText,
  spreadsheet: FileSpreadsheet,
  archive: FileArchive,
  other: File,
}

export type FileTypeIconProps = LucideProps & {
  mediaType?: string | null
  fileName?: string | null
}

/** Ícone do tipo de um arquivo, pelo MIME ou pela extensão. Sempre neutro. */
export function FileTypeIcon({ mediaType, fileName, ...props }: FileTypeIconProps) {
  const Icon = ICONS[getFileKind(mediaType, fileName)]
  return <Icon aria-hidden {...props} />
}
