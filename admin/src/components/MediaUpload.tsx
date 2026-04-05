import { useRef, useState } from 'react'
import { uploadMedia, type MediaKind } from '@lib/uploadMedia'
import './MediaUpload.css'

type MediaType = 'image' | 'video'

interface MediaUploadProps {
  mediaType: MediaType
  kind: MediaKind
  value: string
  onChange: (url: string) => void
  onError?: (message: string) => void
  disabled?: boolean
}

const ACCEPT: Record<MediaType, string> = {
  image: 'image/jpeg,image/png,image/gif,image/webp',
  video: 'video/mp4,video/webm,video/quicktime',
}

export function MediaUpload({ mediaType, kind, value, onChange, onError, disabled }: MediaUploadProps) {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    onError?.('')
    const { url, error } = await uploadMedia(file, kind)
    setUploading(false)
    if (e.target) e.target.value = ''
    if (error) {
      onError?.(error)
      return
    }
    onChange(url)
  }

  return (
    <div className="media-upload">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT[mediaType]}
        capture={mediaType === 'image' ? 'environment' : undefined}
        onChange={handleChange}
        disabled={disabled || uploading}
        className="media-upload-input"
        aria-label={mediaType === 'image' ? 'Importer une image' : 'Importer une vidéo'}
      />
      <div className="media-upload-actions">
        <button
          type="button"
          className="media-upload-btn"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || uploading}
        >
          {uploading ? 'Téléversement…' : mediaType === 'image' ? 'Choisir une image' : 'Choisir une vidéo'}
        </button>
        {mediaType === 'image' && (
          <span className="media-upload-hint">Sur téléphone : appareil photo ou galerie</span>
        )}
      </div>
      {value && (
        <div className="media-upload-preview">
          {mediaType === 'image' ? (
            <img src={value} alt="Aperçu" className="media-upload-preview-img" />
          ) : (
            <video src={value} controls className="media-upload-preview-video" />
          )}
          <button
            type="button"
            className="media-upload-remove"
            onClick={() => onChange('')}
            disabled={disabled}
            aria-label="Retirer le fichier"
          >
            Retirer
          </button>
        </div>
      )}
    </div>
  )
}
