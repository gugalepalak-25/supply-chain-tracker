import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

interface QRProps {
  value: string
  size?: number
  className?: string
}

/**
 * QR code component with responsive sizing.
 * Uses qrcode library to generate a data URL.
 */
export default function QR({ value, size = 160, className = '' }: QRProps) {
  const [src, setSrc] = useState<string>('')
  const [error, setError] = useState<boolean>(false)

  useEffect(() => {
    if (!value) return
    setError(false)
    QRCode.toDataURL(value, {
      margin: 1,
      width: size * 4,
      color: { dark: '#0b0d12', light: '#f4f6fb' },
    })
      .then(setSrc)
      .catch(() => setError(true))
  }, [value, size])

  if (error) {
    return (
      <div className="qr-placeholder" style={{ width: size, height: size }} aria-label="QR code generation failed">
        <span>Failed to generate QR</span>
      </div>
    )
  }

  if (!src) {
    return <div style={{ width: size, height: size }} className="qr-placeholder" aria-label="Generating QR code" />
  }

  return (
    <img
      src={src}
      alt={`QR code for product ${value}`}
      width={size}
      height={size}
      className={`qr-img ${className}`}
      loading="lazy"
    />
  )
}
