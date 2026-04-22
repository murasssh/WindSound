import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Trash2 } from 'lucide-react'
import { usePlayerStore } from '@/state/playerStore'
import type { Track } from '@/types'

const makeFallbackThumbnail = (label: string) =>
  `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><rect width="240" height="240" rx="22" fill="#1b1b1f"/><text x="50%" y="50%" fill="#f4f4f5" font-family="Inter, Arial, sans-serif" font-size="20" letter-spacing="4" text-anchor="middle" dominant-baseline="middle">${label.slice(0, 12).toUpperCase()}</text></svg>`,
  )}`

const SortableQueueItem = ({
  track,
  index,
  active,
  onPlay,
  onRemove,
}: {
  track: Track
  index: number
  active: boolean
  onPlay: () => void
  onRemove: () => void
}) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: track.id,
  })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`flex items-center gap-4 rounded-2xl p-4 transition duration-150 ${
        active
          ? 'bg-[color:color-mix(in_srgb,var(--color-accent)_12%,var(--color-surface)_88%)]'
          : 'bg-[var(--color-surface)]'
      }`}
    >
      <button
        type="button"
        className="cursor-grab text-[var(--color-subtext)] active:cursor-grabbing"
        aria-label="Reordenar faixa"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={18} />
      </button>

      <button type="button" onClick={onPlay} className="flex min-w-0 flex-1 items-center gap-4 text-left">
        <img
          src={track.thumbnail}
          alt={track.title}
          className="h-16 w-16 rounded-[16px] object-cover"
          onError={(event) => {
            event.currentTarget.onerror = null
            event.currentTarget.src = makeFallbackThumbnail(track.title)
          }}
        />
        <div className="min-w-0">
          <p className="truncate text-[15px] font-medium text-[var(--color-text)]">{track.title}</p>
          <p className="mt-1 truncate text-[13px] text-[var(--color-subtext)]">{track.channelTitle}</p>
          <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-[var(--color-subtext)]">
            #{index + 1} • {track.durationLabel}
          </p>
        </div>
      </button>

      <button
        type="button"
        onClick={onRemove}
        className="rounded-xl border border-[var(--color-border)] p-3 text-[var(--color-subtext)] transition duration-150 hover:border-rose-400 hover:text-rose-300"
        aria-label={`Remover ${track.title} da fila`}
      >
        <Trash2 size={16} />
      </button>
    </div>
  )
}

const Queue = () => {
  const { queue, currentIndex, playFromQueue, removeFromQueue, clearQueue, moveTrack } = usePlayerStore((state) => ({
    queue: state.queue,
    currentIndex: state.currentIndex,
    playFromQueue: state.playFromQueue,
    removeFromQueue: state.removeFromQueue,
    clearQueue: state.clearQueue,
    moveTrack: state.moveTrack,
  }))

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (!over || active.id === over.id) {
      return
    }

    const oldIndex = queue.findIndex((track) => track.id === active.id)
    const newIndex = queue.findIndex((track) => track.id === over.id)

    if (oldIndex < 0 || newIndex < 0) {
      return
    }

    arrayMove(queue, oldIndex, newIndex)
    moveTrack(oldIndex, newIndex)
  }

  return (
    <section className="space-y-6">
      {/* TODO: implementar CRUD de playlists locais (indexedDB) */}

      {queue.length > 0 ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={clearQueue}
            className="rounded-xl border border-[var(--color-border)] px-4 py-3 text-[13px] text-[var(--color-text)] transition duration-150 hover:scale-[0.97] hover:border-rose-400 hover:text-rose-300"
          >
            Limpar fila
          </button>
        </div>
      ) : null}

      {queue.length === 0 ? (
        <div className="rounded-[20px] bg-[var(--color-surface)] p-10 text-center text-[13px] text-[var(--color-subtext)]">
          A fila esta vazia. Adicione algo na busca para comecar a sessao.
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={queue.map((track) => track.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {queue.map((track, index) => (
                <SortableQueueItem
                  key={track.id}
                  track={track}
                  index={index}
                  active={index === currentIndex}
                  onPlay={() => playFromQueue(index)}
                  onRemove={() => removeFromQueue(index)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </section>
  )
}

export default Queue
