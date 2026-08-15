import { useState, useRef, useId } from 'react'
import { cn } from '../../lib/cn.js'
import Icon from './Icon.jsx'
import Badge from './Badge.jsx'

// There is no upload endpoint — files are held in component state and their
// names shown back, which is all the document flows need to be exercised.
export default function FileDrop({ label, hint, accept = '.pdf,.png,.jpg,.jpeg', multiple = true, files = [], onChange, error, className }) {
  const [over, setOver] = useState(false)
  const inputRef = useRef(null)
  const id = useId()

  const add = (fileList) => {
    const next = [...files]
    Array.from(fileList).forEach((file) => {
      if (!next.some((f) => f.name === file.name && f.size === file.size)) {
        next.push({ name: file.name, size: file.size, type: file.type })
      }
    })
    onChange(multiple ? next : next.slice(-1))
  }

  return (
    <div className={cn('field', className)}>
      {label ? (
        <span className="field-label" id={`${id}-label`}>
          {label}
        </span>
      ) : null}

      <label
        className={cn('filedrop', over && 'is-over')}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          add(e.dataTransfer.files)
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          aria-labelledby={label ? `${id}-label` : undefined}
          onChange={(e) => {
            add(e.target.files)
            e.target.value = ''
          }}
        />
        <span className="stack center gap-4">
          <Icon name="upload" size={20} className="c-subtle" />
          <span className="t-md c-strong fw-500">Drop files here or click to browse</span>
          <span className="t-sm c-muted">{accept.replaceAll('.', '').toUpperCase().replaceAll(',', ', ')} · up to 10 MB each</span>
        </span>
      </label>

      {files.length ? (
        <ul className="stack gap-6 mt-8">
          {files.map((file) => (
            <li key={file.name} className="row gap-8 between" style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
              <span className="row gap-8 grow" style={{ minWidth: 0 }}>
                <Icon name="file" size={15} className="c-muted shrink-0" />
                <span className="truncate t-md">{file.name}</span>
              </span>
              <Badge tone="neutral" size="sm">
                {file.size ? `${Math.max(1, Math.round(file.size / 1024))} KB` : 'attached'}
              </Badge>
              <button
                type="button"
                className="icon-btn"
                style={{ width: 24, height: 24 }}
                onClick={() => onChange(files.filter((f) => f.name !== file.name))}
                aria-label={`Remove ${file.name}`}
              >
                <Icon name="x" size={13} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <span className="field-error">
          <Icon name="alertCircle" size={13} />
          {error}
        </span>
      ) : null}
      {hint && !error ? <span className="field-hint">{hint}</span> : null}
    </div>
  )
}

// Square photo slots for the driver's checklist, POD and incident screens.
export function PhotoCapture({ slots = 3, photos = [], onChange, label = 'Photos' }) {
  const inputRef = useRef(null)

  return (
    <div className="field">
      <span className="field-label">
        {label}
        <span className="c-muted fw-500">
          ({photos.length}/{slots})
        </span>
      </span>

      <div className="row gap-8 wrap">
        {photos.map((photo, i) => (
          <div key={photo.id} className="photo-slot is-filled">
            <Icon name="image" size={20} />
            <span className="photo-slot-label">Photo {i + 1}</span>
            <button
              type="button"
              className="photo-slot-remove"
              onClick={() => onChange(photos.filter((p) => p.id !== photo.id))}
              aria-label={`Remove photo ${i + 1}`}
            >
              <Icon name="x" size={12} />
            </button>
          </div>
        ))}

        {photos.length < slots ? (
          <button type="button" className="photo-slot" onClick={() => inputRef.current?.click()}>
            <Icon name="camera" size={20} />
            <span className="photo-slot-label">Capture</span>
          </button>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0]
          onChange([...photos, { id: `photo-${Date.now()}`, name: file?.name ?? `capture-${photos.length + 1}.jpg`, at: Date.now() }])
          e.target.value = ''
        }}
      />
    </div>
  )
}
