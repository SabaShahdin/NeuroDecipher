import React from "react";

export default function RecordingNotice({ C, error, message }) {
  if (!error && !message) return null;
  const color = error ? C.red : C.blue;
  return (
    <div style={{ border: `1px solid ${color}66`, background: `${color}16`, color, borderRadius: 12, padding: "11px 13px", fontSize: 12, fontWeight: 800 }}>
      {error || message}
    </div>
  );
}
