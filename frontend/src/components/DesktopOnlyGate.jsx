import { useEffect, useState } from "react";

/**
 * NeuroDecipher is a desktop-only tool (dense EEG viewer, multi-panel
 * layouts). This gate hides the app the instant the screen is not a
 * desktop-sized screen and shows a "not supported" message instead —
 * with no flash of the real UI and no delay reacting to a resolution
 * change.
 *
 * Detection is a plain width/height check against both the current
 * viewport AND the physical screen, so it catches:
 *   - a browser window resized/narrowed below desktop size
 *   - a phone/tablet screen (small physical resolution)
 *   - an actual display-resolution change while the app is open
 *
 * Reaction is immediate and has no "hesitation":
 *   - the very first render already computes the answer synchronously
 *     (no useEffect delay before the message can appear)
 *   - `resize` / `orientationchange` catch window-driven changes
 *   - a fast interval poll catches resolution changes that don't fire
 *     a `resize` event (e.g. OS display-resolution changes, external
 *     monitor connect/disconnect) so the check never lags behind
 */

const MIN_DESKTOP_WIDTH = 1024;
const MIN_DESKTOP_HEIGHT = 600;
const POLL_INTERVAL_MS = 250;

function computeIsDesktop() {
  if (typeof window === "undefined") return true;

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const screenWidth = window.screen ? window.screen.width : viewportWidth;

  return (
    viewportWidth >= MIN_DESKTOP_WIDTH &&
    viewportHeight >= MIN_DESKTOP_HEIGHT &&
    screenWidth >= MIN_DESKTOP_WIDTH
  );
}

export default function DesktopOnlyGate({ children }) {
  const [isDesktop, setIsDesktop] = useState(computeIsDesktop);

  useEffect(() => {
    const check = () => {
      setIsDesktop((prev) => {
        const next = computeIsDesktop();
        return prev === next ? prev : next;
      });
    };

    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    const intervalId = window.setInterval(check, POLL_INTERVAL_MS);

    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
      window.clearInterval(intervalId);
    };
  }, []);

  // IMPORTANT: the app is never unmounted here. Swapping between the app
  // and the notice by returning different trees would tear down live
  // state — most notably the Live Prediction SSE connection and its
  // in-memory events — every time the screen crossed the desktop
  // threshold, causing Live Prediction to come back empty after
  // resizing back up even though other pages (which re-fetch by job id)
  // looked fine. Instead we keep `children` mounted at all times and
  // just hide it visually behind the notice.
  return (
    <>
      <div
        style={isDesktop ? undefined : { display: "none" }}
        aria-hidden={!isDesktop}
        inert={!isDesktop ? "" : undefined}
      >
        {children}
      </div>
      {!isDesktop && <UnsupportedScreenNotice />}
    </>
  );
}

function UnsupportedScreenNotice() {
  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        display: "grid",
        placeItems: "center",
        background:
          "linear-gradient(135deg,#061426 0%,#0A2038 55%,#07182B 100%)",
        color: "#E6F1FF",
        fontFamily: "'Roboto', Arial, sans-serif",
        padding: "24px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          maxWidth: 420,
          width: "100%",
          textAlign: "center",
          background: "rgba(8,24,43,.92)",
          border: "1px solid rgba(91,145,205,.42)",
          borderRadius: 16,
          padding: "36px 28px",
          boxShadow: "0 16px 40px rgba(37,99,235,.18)",
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            margin: "0 auto 18px",
            borderRadius: "50%",
            background: "rgba(75,163,255,.14)",
            display: "grid",
            placeItems: "center",
            fontSize: 26,
          }}
          aria-hidden="true"
        >
          🖥️
        </div>
        <h1
          style={{
            fontSize: 19,
            fontWeight: 700,
            margin: "0 0 10px",
            color: "#E6F1FF",
          }}
        >
          Desktop screen required
        </h1>
        <p
          style={{
            fontSize: 14.5,
            lineHeight: 1.6,
            color: "#B8CDE6",
            margin: 0,
          }}
        >
          NeuroDecipher is built for larger desktop screens and doesn't work
          on mobile or tablet displays yet. Please reopen this app on a
          desktop or laptop computer to continue.
        </p>
      </div>
    </div>
  );
}
