import { Component, type ErrorInfo, type ReactNode } from "react";

export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      "The bus tracker could not render.",
      error,
      info.componentStack,
    );
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="fatal-error" role="alert">
          <h1>Unable to display the bus tracker</h1>
          <p>
            Refresh the page. If the problem continues, contact transportation
            support.
          </p>
          <button type="button" onClick={() => window.location.reload()}>
            Refresh page
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}
