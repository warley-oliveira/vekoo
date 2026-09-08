// Olha o PNG no navegador antes de subir: tem canal alfa com algum pixel
// transparente de verdade? O servidor faz a mesma conta e a dele é a que
// vale; esta existe para o alerta aparecer na hora, sem esperar o upload.

const MAX_SAMPLED_PIXELS = 4_000_000

export type TransparencyResult = boolean | null

export function inspectPngTransparency(file: File): Promise<TransparencyResult> {
  if (file.type !== "image/png") return Promise.resolve(null)

  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(url)
      try {
        const scale = Math.min(1, Math.sqrt(MAX_SAMPLED_PIXELS / (image.width * image.height)))
        const width = Math.max(1, Math.round(image.width * scale))
        const height = Math.max(1, Math.round(image.height * scale))
        const canvas = document.createElement("canvas")
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext("2d", { willReadFrequently: true })
        if (!context) return resolve(null)
        context.drawImage(image, 0, 0, width, height)
        const { data } = context.getImageData(0, 0, width, height)
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] < 255) return resolve(true)
        }
        resolve(false)
      } catch {
        resolve(null)
      }
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    image.src = url
  })
}
