# NeuroDecipher Frontend

React + Vite single-page app for uploading EEG recordings, running live
AI/rule/hybrid seizure prediction, reviewing interpretability output,
annotating results, and generating PDF reports.

## Structure

```text
src/
├── main.jsx              # Vite entry point
├── AppRoot.jsx            # auth gate (sign in / sign up) wrapping the app
├── App.jsx                # top-level page router/state for the signed-in app
├── constants.js           # API base URL + shared design tokens
├── auth/                  # AuthContext (JWT session state)
├── pages/                 # thin route-level wrappers
├── features/
│   ├── dashboard/          # Dashboard page + panels
│   ├── live/                # Upload, processing, live prediction
│   ├── interpretability/    # AI / rule / hybrid interpretation views
│   ├── recordings/          # Recording (analysis) management
│   ├── reports/              # Report + report-generation views
│   ├── annotations/          # Annotation table, charts, toolbar
│   └── app/                   # app-level UI (error modal, etc.)
├── components/              # shared EEG viewer, sidebar nav, status UI
│   └── reference/             # large analysis-screen components
├── hooks/                    # useEegStream, useAnnotations, usePlayback, useNdTheme
├── theme/                    # shared theme tokens (ndThemeTokens.js)
└── index.css                  # global font + scrollbar/theme CSS
```

`pages/*.jsx` files are intentionally thin re-exports — edit the real UI
inside the matching `features/<area>/` folder.

## Configuration

Copy `.env.example` to `.env.local` and set `VITE_API_BASE_URL` to point at
your backend (defaults to `http://localhost:5000` for local dev).

## Run locally

```bash
npm install
npm run dev       # http://localhost:5173
```

## Build for production

```bash
npm run build      # outputs static files to dist/
npm run preview    # serve the production build locally to sanity-check it
```

`dist/` is a fully static bundle — deploy it to any static host (S3 +
CloudFront, Amplify, Nginx, etc.). See `../DEPLOYMENT.md` for AWS specifics.
