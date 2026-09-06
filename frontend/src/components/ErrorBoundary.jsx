import { Component } from "react";

/**
 * Catches render errors from the routed tree.
 *
 * Without this, one component throwing (e.g. a route assuming an API returns
 * an array when it returns an envelope) unmounts the entire application and
 * leaves a blank white page with no way back.
 *
 * It wraps <Routes> in App.jsx, so when it trips it replaces the whole routed
 * area, sidebar included — the copy below must not claim otherwise. "Try again"
 * only clears the error and re-renders the same view, which will throw again if
 * the cause is deterministic.
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Route error:", error, info?.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="route-error" role="alert">
        <span className="route-error__icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 9v4M12 17h.01" />
            <path d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
          </svg>
        </span>
        <h1 className="route-error__title">This page failed to render</h1>
        <p className="route-error__text">
          Something in this view threw an error, so the interface was replaced
          rather than left blank. Retrying re-renders the same view; if the error
          repeats, reload the page or open a different one. Nothing was saved or
          changed by the failure.
        </p>
        <p className="route-error__detail">{String(this.state.error?.message || this.state.error)}</p>
        <div className="route-error__actions">
          <button type="button" className="ui-btn ui-btn--secondary" onClick={this.handleReset}>
            Try again
          </button>
          <a href="/dashboard" className="ui-btn ui-btn--ghost">Go to dashboard</a>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
