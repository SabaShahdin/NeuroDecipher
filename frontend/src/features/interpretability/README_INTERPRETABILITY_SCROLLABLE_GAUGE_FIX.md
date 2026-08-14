# Interpretability UI Fixes

This update improves the interpretability page panels and readability.

## Updated behavior

- Clinical Interpretation keeps the original label text and now wraps into multiple lines.
- Clinical Interpretation box is scrollable when the summary is long.
- Rule table shows all rules instead of cutting after 8 rows.
- Rule table has its own vertical and horizontal scrollbar.
- Purple numbered panel circles were removed and replaced with a clean accent bar.
- Hybrid Fusion gauge was enlarged and rebuilt for better readability in both light and dark themes.
- Hybrid Fusion center text now shows the final decision clearly inside the gauge.
- Agreement matrix uses larger text and stronger theme-aware contrast.

## Files updated

- `features/interpretability/InterpretabilityPage.jsx`
- `features/interpretability/components/RuleTable.jsx`
- `features/interpretability/components/Panel.jsx`
- `features/interpretability/components/HybridFusion.jsx`
