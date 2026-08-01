import { Canvas } from './components/Canvas'
import { Inspector } from './components/Inspector'
import { ProjectPanel } from './components/ProjectPanel'
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
        <aside
          style={{
            width: 260,
            borderLeft: '1px solid #ddd',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          <ProjectPanel />
          <Inspector />
        </aside>
      </div>
    </div>
  )
}

export default App
