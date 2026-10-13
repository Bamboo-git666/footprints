import { useBlobUrl } from '@/hooks/useBlobUrl'
import { cn } from '@/lib/utils'
import type { Photo } from '@/types'

export function PhotoThumb({
  photo,
  onClick,
  className,
  draggable = true,
  fill = false
}: {
  photo: Photo
  onClick?: () => void
  className?: string
  draggable?: boolean
  fill?: boolean
}) {
  const thumb = useBlobUrl(photo.id, 'thumb')
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'photo-item group relative block w-full overflow-hidden rounded-xl bg-line/[0.05] text-left',
        fill && 'h-full',
        className
      )}
    >
      <div
        style={fill ? undefined : { aspectRatio: `${photo.width || 4} / ${photo.height || 3}` }}
        className={cn('w-full', fill && 'absolute inset-0 h-full')}
      >
        {thumb ? (
          <img
            src={thumb}
            alt={photo.name || photo.fileName}
            loading="lazy"
            decoding="async"
            draggable={draggable}
            className="h-full w-full object-cover opacity-0 transition duration-500 group-hover:scale-[1.03] [&.loaded]:opacity-100"
            onLoad={(e) => e.currentTarget.classList.add('loaded')}
          />
        ) : (
          <div className="h-full w-full animate-pulse bg-line/10" />
        )}
      </div>
    </button>
  )
}
