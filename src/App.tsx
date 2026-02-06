import { useMemo } from 'react'
import ControlWindow from './components/ControlWindow'
import PGMWindow from './components/PGMWindow'
import TabWindow from './components/TabWindow'

function App() {
  const { windowType, tabId } = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    return {
      windowType: params.get('window') || 'control',
      tabId: params.get('tabId') || '',
    }
  }, [])

  if (windowType === 'pgm') {
    return <PGMWindow />
  }

  if (windowType === 'tab' && tabId) {
    return <TabWindow tabId={tabId} />
  }

  return <ControlWindow />
}

export default App
