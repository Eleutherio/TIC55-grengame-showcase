import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "touchstart",
  "scroll",
  "wheel",
];

const DEFAULT_THROTTLE_MS = 500;

type UserActivityOptions = {
  enabled?: boolean;
  events?: string[];
  throttleMs?: number;
  onActivity?: (event: Event) => void;
};

const hasWindowObject = typeof window !== "undefined";

export function useUserActivity(options: UserActivityOptions = {}) {
  const {
    enabled = true,
    events = DEFAULT_EVENTS,
    throttleMs = DEFAULT_THROTTLE_MS,
    onActivity,
  } = options;

  const [lastActivityAt, setLastActivityAt] = useState(() => Date.now());
  const lastHandledRef = useRef(0);

  const markActivity = useCallback(
    (event?: Event) => {
      const now = Date.now();
      if (throttleMs > 0 && now - lastHandledRef.current < throttleMs) {
        return;
      }
      lastHandledRef.current = now;
      setLastActivityAt(now);
      if (event && onActivity) {
        onActivity(event);
      } else if (onActivity) {
        onActivity(new Event("activity"));
      }
    },
    [onActivity, throttleMs],
  );

  useEffect(() => {
    if (!hasWindowObject || !enabled || events.length === 0) {
      return;
    }

    const handleActivity = (event: Event) => {
      markActivity(event);
    };

    events.forEach((eventName) => {
      window.addEventListener(eventName, handleActivity, { passive: true });
    });

    return () => {
      events.forEach((eventName) => {
        window.removeEventListener(eventName, handleActivity);
      });
    };
  }, [enabled, events, markActivity]);

  return { lastActivityAt, markActivity };
}
