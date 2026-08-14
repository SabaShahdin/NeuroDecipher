import { useCallback, useEffect, useRef, useState } from "react";
// ─────────────────────────────────────────────────────────────────────────────
//  HOOK: usePlayback
// ─────────────────────────────────────────────────────────────────────────────
export function usePlayback({ totalDur, windowSize }) {
  const [timeOffset, setTimeOffset] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const rafRef = useRef(null);
  const t0Ref = useRef(null);

  const maxOffset = Math.max(0, Number(totalDur || 0) - Number(windowSize || 0));

  const stopAnimation = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    t0Ref.current = null;
  }, []);

  const jumpTo = useCallback((t, { keepPlaying = false } = {}) => {
    const next = Math.max(0, Math.min(Number(t) || 0, maxOffset));
    setTimeOffset(next);
    t0Ref.current = null;
    if (!keepPlaying) setIsPlaying(false);
  }, [maxOffset]);

  const seekBy = useCallback((delta) => {
    setTimeOffset((prev) => Math.max(0, Math.min(prev + Number(delta || 0), maxOffset)));
    t0Ref.current = null;
  }, [maxOffset]);

  const playLoop = useCallback((now) => {
    if (t0Ref.current === null) t0Ref.current = now;
    const dt = Math.max(0, (now - t0Ref.current) / 1000);
    t0Ref.current = now;

    let reachedEnd = false;
    setTimeOffset((prev) => {
      const next = Math.max(0, Math.min(prev + dt, maxOffset));
      reachedEnd = next >= maxOffset && maxOffset > 0;
      return next;
    });

    if (reachedEnd) {
      setIsPlaying(false);
      stopAnimation();
      return;
    }
    rafRef.current = requestAnimationFrame(playLoop);
  }, [maxOffset, stopAnimation]);

  useEffect(() => {
    if (!isPlaying || maxOffset <= 0) {
      stopAnimation();
      if (maxOffset <= 0) setIsPlaying(false);
      return;
    }
    t0Ref.current = null;
    rafRef.current = requestAnimationFrame(playLoop);
    return stopAnimation;
  }, [isPlaying, maxOffset, playLoop, stopAnimation]);

  useEffect(() => {
    setTimeOffset((prev) => Math.max(0, Math.min(prev, maxOffset)));
  }, [maxOffset]);

  const togglePlay = useCallback(() => {
    setIsPlaying((playing) => (maxOffset <= 0 ? false : !playing));
  }, [maxOffset]);

  return { timeOffset, setTimeOffset, isPlaying, togglePlay, jumpTo, seekBy };
}
