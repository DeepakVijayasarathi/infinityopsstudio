"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 22 }}>Something went wrong</h1>
          <p style={{ color: "#64748b" }}>An unexpected error occurred. Please try again.</p>
          <button onClick={reset} style={{ marginTop: 12, padding: "8px 16px", borderRadius: 8, border: "1px solid #cbd5e1", cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
