import { useCallback } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { usePlayerStore } from '../stores/playerStore'
import PlaylistItemComponent from './PlaylistItem'

interface PlaylistProps {
  onItemDoubleClick: (index: number) => void
}

function Playlist({ onItemDoubleClick }: PlaylistProps) {
  const {
    playlist,
    selectedIndex,
    currentIndex,
    setSelectedIndex,
    reorderPlaylist,
  } = usePlayerStore()

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = playlist.findIndex((item) => item.id === active.id)
      const newIndex = playlist.findIndex((item) => item.id === over.id)

      const newPlaylist = arrayMove(playlist, oldIndex, newIndex)
      reorderPlaylist(newPlaylist)
    }
  }, [playlist, reorderPlaylist])

  if (playlist.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-500 p-8">
        <p className="text-sm mb-2">플레이리스트가 비어있습니다</p>
        <p className="text-xs">파일을 드래그하거나 추가 버튼을 클릭하세요</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-2">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={playlist.map((item) => item.id)}
          strategy={verticalListSortingStrategy}
        >
          {playlist.map((item, index) => (
            <PlaylistItemComponent
              key={item.id}
              item={item}
              index={index}
              isSelected={index === selectedIndex}
              isPlaying={index === currentIndex}
              onClick={() => setSelectedIndex(index)}
              onDoubleClick={() => onItemDoubleClick(index)}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  )
}

export default Playlist
