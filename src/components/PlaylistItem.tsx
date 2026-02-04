import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Play, Globe, Film } from 'lucide-react'
import type { PlaylistItem as PlaylistItemType } from '../types'

interface PlaylistItemProps {
  item: PlaylistItemType
  index: number
  isSelected: boolean
  isPlaying: boolean
  onClick: () => void
  onDoubleClick: () => void
}

function PlaylistItemComponent({
  item,
  index,
  isSelected,
  isPlaying,
  onClick,
  onDoubleClick,
}: PlaylistItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        playlist-item mb-1
        ${isSelected ? 'selected' : ''}
        ${isPlaying ? 'playing' : ''}
        ${isDragging ? 'dragging' : ''}
      `}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      {/* 드래그 핸들 */}
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-gray-600 hover:text-gray-400"
      >
        <GripVertical size={16} />
      </div>

      {/* 인덱스 */}
      <span className="text-xs text-gray-500 w-6 text-center">
        {index + 1}
      </span>

      {/* 타입 아이콘 */}
      <div className={`${item.type === 'url' ? 'text-purple-400' : 'text-gray-500'}`}>
        {item.type === 'url' ? <Globe size={14} /> : <Film size={14} />}
      </div>

      {/* 재생 중 아이콘 */}
      {isPlaying && (
        <div className="text-pgm-live">
          <Play size={14} fill="currentColor" />
        </div>
      )}

      {/* 파일명 */}
      <span className="flex-1 truncate text-sm">
        {item.name}
      </span>

      {/* 재생 중 표시 */}
      {isPlaying && (
        <span className="text-xs px-2 py-0.5 rounded bg-pgm-live/20 text-pgm-live">
          LIVE
        </span>
      )}
    </div>
  )
}

export default PlaylistItemComponent
