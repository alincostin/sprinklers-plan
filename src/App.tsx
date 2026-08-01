import { Canvas } from './components/Canvas'
import { Inspector } from './components/Inspector'
import { Toolbar } from './components/Toolbar'
import './App.css'

function App() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Toolbar />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1 }}>
          <Canvas />
        </div>
        <Inspector />
      </div>
    </div>
  )
}

export default App
