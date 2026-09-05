function ascii(data: Uint8Array, start: number, end: number) {
  return String.fromCharCode(...data.slice(start, end))
}

export function mediaSignatureMatches(data: Uint8Array, contentType: string) {
  const category = contentType.split('/')[0] || ''
  if (!['image', 'video', 'audio'].includes(category) || data.length < 12)
    return false

  const image = (
    (data[0] === 0xFF && data[1] === 0xD8 && data[2] === 0xFF)
    || ascii(data, 1, 4) === 'PNG'
    || ascii(data, 0, 6) === 'GIF87a'
    || ascii(data, 0, 6) === 'GIF89a'
    || (ascii(data, 0, 4) === 'RIFF' && ascii(data, 8, 12) === 'WEBP')
  )
  if (category === 'image')
    return image

  const isoMedia = ascii(data, 4, 8) === 'ftyp'
  const webm = data[0] === 0x1A && data[1] === 0x45 && data[2] === 0xDF && data[3] === 0xA3
  const ogg = ascii(data, 0, 4) === 'OggS'
  if (category === 'video')
    return isoMedia || webm || ogg

  const mp3 = ascii(data, 0, 3) === 'ID3' || (data[0] === 0xFF && (data[1]! & 0xE0) === 0xE0)
  const wav = ascii(data, 0, 4) === 'RIFF' && ascii(data, 8, 12) === 'WAVE'
  const flac = ascii(data, 0, 4) === 'fLaC'
  return isoMedia || webm || ogg || mp3 || wav || flac
}
