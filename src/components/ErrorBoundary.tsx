import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="m-8 rounded-xl border border-red-200 bg-red-50 p-6 text-sm dark:border-red-900 dark:bg-red-950/40">
          <h2 className="text-base font-semibold text-red-700 dark:text-red-300">Something went wrong</h2>
          <pre className="mt-2 whitespace-pre-wrap font-mono text-xs text-red-800 dark:text-red-200">{String(this.state.error?.message ?? this.state.error)}</pre>
          <button className="btn-secondary mt-4" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
