import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

export default function QR({ value, size = 160 }: { value: string; size?: number }) {
  const [src, setSrc] = useState<string>('')
  useEffect(() => {
    QRCode.toDataURL(value, { margin: 1, width: size * 4, color: { dark: '#0b0d12', light: '#f4f6fb' } })
      .then(setSrc)
      .catch(() => {})
  }, [value, size])

  if (!src) return <div style={{ width: size, height: size }} className="qr-placeholder" />
  return <img src={src} alt={`QR code for ${value}`} width={size} height={size} />
}
