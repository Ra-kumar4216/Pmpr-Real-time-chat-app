export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const ACCEPT_IMAGES = ALLOWED_IMAGE_TYPES.join(',')
export const MAX_INPUT_BYTES = 15 * 1024 * 1024
export const AVATAR_EDGE = 512
export const CHAT_IMAGE_EDGE = 1600

/** Returns a message to show the user, or null when the file is acceptable. */
export function validateImageFile(file: { type: string; size: number }): string | null {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) return 'Please choose a JPEG, PNG or WebP image.'
  if (file.size > MAX_INPUT_BYTES) return 'That image is larger than 15 MB. Please choose a smaller one.'
  if (file.size === 0) return 'That file is empty.'
  return null
}

/** Size after scaling so the longest edge is at most `maxEdge`. Never enlarges. */
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/** Largest centered square of a w x h image. */
export function centerSquare(width: number, height: number): { sx: number; sy: number; size: number } {
  const size = Math.min(width, height)
  return { sx: Math.round((width - size) / 2), sy: Math.round((height - size) / 2), size }
}

/**
 * Re-encodes a photo as JPEG in the browser: honours EXIF rotation, drops metadata (such as GPS),
 * and keeps uploads small. `square` crops the centre, used for profile photos.
 */
export async function resizeImage(file: Blob, opts: { maxEdge: number; square?: boolean; quality?: number }): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas is not available')

    if (opts.square) {
      const { sx, sy, size } = centerSquare(bitmap.width, bitmap.height)
      const edge = Math.min(opts.maxEdge, size)
      canvas.width = edge
      canvas.height = edge
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, edge, edge)
      ctx.drawImage(bitmap, sx, sy, size, size, 0, 0, edge, edge)
    } else {
      const { width, height } = fitWithin(bitmap.width, bitmap.height, opts.maxEdge)
      canvas.width = width
      canvas.height = height
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, width, height)
      ctx.drawImage(bitmap, 0, 0, width, height)
    }

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not process that image'))), 'image/jpeg', opts.quality ?? 0.85)
    })
  } finally {
    bitmap.close()
  }
}
