# Reference components split

`ReferenceComponents.jsx` is now only a barrel/export file. The large viewer code has been divided into smaller files under `src/components/reference/parts/`:

- `ReferenceTitleBar.jsx` — top tab/title bar.
- `ReferenceViewerHeader.jsx` — file info, playback controls, sensitivity/view/reset/upload controls.
- `ReferenceChannelRail.jsx` — channel list and region grouping.
- `ReferenceEegCanvas.jsx` — Plotly EEG waveform canvas.
- `ReferenceTimelineStack.jsx` — AI/rule/hybrid/annotation/raw timeline.
- `ReferenceEnginePanels.jsx` — AI, rule, and hybrid result cards.
- `useBackendAnalysisDetails.js` — backend analysis details hook.

Dark theme updates:

- Dark panels use deeper navy surfaces.
- Timeline labels are larger and more readable.
- Timeline tracks and markers use higher opacity.
- Raw signal and seizure overlays are stronger in dark mode.
- Borders/lines are more visible on dark panels.
