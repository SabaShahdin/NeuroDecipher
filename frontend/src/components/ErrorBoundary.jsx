import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[UI ErrorBoundary]", error, info);
    const message = error?.message || "A frontend render error occurred.";
    if (typeof this.props.onError === "function") {
      this.props.onError(message);
    } else if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("nd:frontend-error", { detail: { message } }));
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, color: "var(--text, #e5e7eb)", background: "var(--bg, #020617)", minHeight: "100vh" }}>
          <h2>Something went wrong in this panel.</h2>
          <p style={{ opacity: 0.8 }}>The rest of the app is protected from this render error. Check the browser console for details.</p>
          <button onClick={() => this.setState({ error: null })}>Try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}
