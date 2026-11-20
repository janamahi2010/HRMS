/** Upload rules shared by every screen. The storage bucket refuses files over 3 MB. */

export const MAX_UPLOAD_MB = 3
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const IMAGE_ACCEPT = IMAGE_TYPES.join(',')
export const DOCUMENT_ACCEPT = '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export const isDocument = (f: File) => /\.(pdf|docx?)$/i.test(f.name)

export const fmtSize = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`

/** Shrink big phone photos in the browser (faster upload; keeps them under the 3 MB limit). */
export async function shrinkPhoto(file: File, maxSide = 2000): Promise<File> {
  if (file.size < 1.5 * 1024 * 1024 || typeof createImageBitmap !== 'function') return file
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * scale)
    canvas.height = Math.round(bmp.height * scale)
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    bmp.close()
    // JPEG for photos; WebP keeps transparency (logos, posters).
    const type = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp'
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, type, 0.86))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.\w+$/, '') + (type === 'image/jpeg' ? '.jpg' : '.webp'), { type })
  } catch {
    return file
  }
}

/** Check + shrink an image before upload. Returns the file to send, or a message to show. */
export async function prepareImage(file: File, what = 'The image', maxSide = 2000): Promise<{ file: File } | { error: string }> {
  if (isDocument(file)) return { error: `${file.name} is a document. Only JPG, PNG or WebP images can be used here.` }
  if (!IMAGE_TYPES.includes(file.type)) return { error: `${file.name}: use a JPG, PNG or WebP image.` }
  const small = await shrinkPhoto(file, maxSide)
  if (small.size > MAX_UPLOAD_BYTES)
    return { error: `${what} is ${fmtSize(small.size)}. The limit is ${MAX_UPLOAD_MB} MB, so please choose a smaller one.` }
  return { file: small }
}

/** Check a PDF / Word document before upload. Returns a message, or null when it's fine. */
export function checkDocument(file: File): string | null {
  if (!isDocument(file)) return `${file.name}: only PDF or Word (.doc, .docx) files can be attached.`
  if (file.size > MAX_UPLOAD_BYTES) return `${file.name} is ${fmtSize(file.size)}. The limit is ${MAX_UPLOAD_MB} MB, so please choose a smaller one.`
  return null
}
