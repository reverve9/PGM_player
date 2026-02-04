import { useMemo } from 'react'
import ControlWindow from './components/ControlWindow'
import PGMWindow from './components/PGMWindow'

function App() {
  const windowType = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('window') || 'control'
  }, [])

  if (windowType === 'pgm') {
    return <PGMWindow />
  }

  return <ControlWindow />
}

export default App
