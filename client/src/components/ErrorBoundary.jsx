import React from 'react';

/**
 * Global error boundary — a crashed component must never produce a blank screen.
 * Shows a friendly recovery screen with a "Try Again" button.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[Priya UI] Component crashed:', error, info && info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="fatal-screen">
          <div className="fatal-card">
            <h1>Something went wrong</h1>
            <p>Priya AI hit an unexpected error and the screen could not render.</p>
            <div className="fatal-actions">
              <button className="btn primary" type="button" onClick={() => window.location.reload()}>
                Try Again
              </button>
              <button className="btn" type="button" onClick={() => this.setState({ error: null })}>
                Continue
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}