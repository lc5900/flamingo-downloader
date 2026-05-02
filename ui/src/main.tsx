import { StrictMode, Component, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

type RootErrorState = {
  error: Error | null
}

class RootErrorBoundary extends Component<{ children: ReactNode }, RootErrorState> {
  state: RootErrorState = { error: null }

  static getDerivedStateFromError(error: Error): RootErrorState {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('root render failed', error, errorInfo)
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: '100vh',
            padding: 24,
            color: '#f5f5f5',
            background: '#1f1f1f',
            fontFamily:
              "'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
          }}
        >
          <h2 style={{ marginTop: 0 }}>Frontend startup failed</h2>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontFamily: 'Consolas, Monaco, monospace',
            }}
          >
            {this.state.error.stack || this.state.error.message}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Missing #root container')
}

createRoot(rootElement).render(
  <StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </StrictMode>,
)
