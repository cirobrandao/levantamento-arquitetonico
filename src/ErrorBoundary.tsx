import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Falha na interface do levantamento.', error, info) }
  render() {
    return this.state.failed ? <section className="editor error-boundary" role="alert"><h2>Não foi possível carregar esta parte da aplicação.</h2><p>Os projetos salvos neste navegador foram mantidos. Reabra a aplicação para tentar novamente.</p><button onClick={() => window.location.reload()}>Reabrir aplicação</button></section> : this.props.children
  }
}
