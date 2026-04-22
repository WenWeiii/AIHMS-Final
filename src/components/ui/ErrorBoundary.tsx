import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      let errorMessage = "Something went wrong. Please try refreshing the page.";
      let isFirestoreError = false;

      try {
        if (this.state.error?.message) {
          const parsed = JSON.parse(this.state.error.message);
          if (parsed.error && parsed.operationType) {
            isFirestoreError = true;
            errorMessage = `A database error occurred during ${parsed.operationType}. This might be due to missing permissions.`;
          }
        }
      } catch {
        // Not a JSON error
      }

      return (
        <div className="min-h-screen bg-surface flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-surface-container-low p-8 rounded-[2.5rem] shadow-ambient text-center space-y-6">
            <div className="w-20 h-20 bg-error/10 text-error rounded-3xl flex items-center justify-center mx-auto">
              <AlertCircle size={40} />
            </div>
            
            <div className="space-y-2">
              <h2 className="text-2xl font-headline font-bold text-primary">
                {isFirestoreError ? "Database Access Denied" : "Unexpected Error"}
              </h2>
              <p className="text-on-surface-variant leading-relaxed">
                {errorMessage}
              </p>
            </div>

            <button
              onClick={this.handleReset}
              className="w-full signature-gradient text-on-primary py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform"
            >
              <RefreshCw size={20} />
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
