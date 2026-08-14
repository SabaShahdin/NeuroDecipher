import React from "react";
import { panelStyle, recordingInputStyle, recordingLabelStyle } from "./RecordingTheme.js";

export default function RecordingEditPanel({ C, selectedRecording, recordingForm, setRecordingForm, saving, onSave, onCancel }) {
  if (!selectedRecording) return null;
  const inputStyle = recordingInputStyle(C);
  const labelStyle = recordingLabelStyle(C);

  return (
    <form onSubmit={onSave} style={{ ...panelStyle(C), padding: 16, alignSelf: "start" }}>
      <div style={{ fontSize: 15, fontWeight: 900, color: C.text, marginBottom: 4 }}>Update Analysis</div>
      <div style={{ fontSize: 10, color: C.dim, marginBottom: 14, fontFamily: "'Roboto', Arial, sans-serif" }}>{selectedRecording.jobId}</div>
      <div style={{ display: "grid", gap: 11 }}>
        <div>
          <label style={labelStyle}>Analysis Label</label>
          <input value={recordingForm.recordingLabel} onChange={(e) => setRecordingForm((f) => ({ ...f, recordingLabel: e.target.value }))} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Type</label>
          <input value={recordingForm.recordingType} onChange={(e) => setRecordingForm((f) => ({ ...f, recordingType: e.target.value }))} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Status</label>
          <select value={recordingForm.status} onChange={(e) => setRecordingForm((f) => ({ ...f, status: e.target.value }))} style={inputStyle}>
            <option value="queued">Queued</option>
            <option value="running">Running</option>
            <option value="ready">Ready</option>
            <option value="review_pending">Review Pending</option>
            <option value="reviewed">Reviewed</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Clinician / Reviewer</label>
          <input value={recordingForm.clinician} onChange={(e) => setRecordingForm((f) => ({ ...f, clinician: e.target.value }))} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Notes</label>
          <textarea value={recordingForm.notes} onChange={(e) => setRecordingForm((f) => ({ ...f, notes: e.target.value }))} style={{ ...inputStyle, height: 90, paddingTop: 10, resize: "vertical" }} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 9, marginTop: 14 }}>
        <button disabled={saving} type="submit" style={{ flex: 1, height: 38, border: "none", borderRadius: 9, background: `linear-gradient(135deg, ${C.blue}, ${C.accent2})`, color: "#fff", fontWeight: 950, cursor: saving ? "wait" : "pointer", boxShadow: `0 10px 24px ${C.blue}28` }}>Save</button>
        <button type="button" onClick={onCancel} style={{ width: 84, height: 38, borderRadius: 9, border: `1px solid ${C.border}`, background: C.panel2, color: C.muted, fontWeight: 800, cursor: "pointer" }}>Cancel</button>
      </div>
    </form>
  );
}
