import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

type Props = {
  children: ReactNode;
  /** Optional label included in the console log / UI to help locate which boundary fired. */
  label?: string;
  fallback?: (error: Error, reset: () => void) => ReactNode;
};

type State = { error: Error | null };

/**
 * Tiny error boundary so a single component crash never produces a fully blank
 * page. The fallback is intentionally chatty so users can copy the error to us.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    // eslint-disable-next-line no-console
    console.error(
      `[ErrorBoundary${this.props.label ? `: ${this.props.label}` : ""}]`,
      error,
      info.componentStack,
    );
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm">
        <div className="flex items-center gap-2 font-semibold text-destructive">
          <AlertTriangle className="h-4 w-4" />
          Something went wrong
          {this.props.label && (
            <span className="text-xs font-normal text-muted-foreground">
              in {this.props.label}
            </span>
          )}
        </div>
        <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs text-destructive/90">
          {error.message}
        </pre>
        <button
          type="button"
          onClick={this.reset}
          className="mt-3 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
        >
          Try again
        </button>
      </div>
    );
  }
}
