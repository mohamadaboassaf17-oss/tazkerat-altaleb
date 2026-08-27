import { useCallback, useEffect, useRef, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const VISITS_KEY = 'install_prompt_visits';
const DISMISSED_KEY = 'install_prompt_dismissed_at';
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MIN_VISITS = 2;

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream;
}

function getVisits(): number {
  try {
    return Number.parseInt(localStorage.getItem(VISITS_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function incrementVisits(): number {
  try {
    const next = getVisits() + 1;
    localStorage.setItem(VISITS_KEY, String(next));
    return next;
  } catch {
    return 0;
  }
}

function getDismissedAt(): number | null {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return null;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function setDismissedNow(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

export interface UseInstallPromptReturn {
  canPrompt: boolean;
  isIos: boolean;
  isStandalone: boolean;
  deferredPrompt: BeforeInstallPromptEvent | null;
  prompt: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
  dismiss: () => void;
}

export function useInstallPrompt(): UseInstallPromptReturn {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [canPrompt, setCanPrompt] = useState(false);
  const standalone = isStandalone();
  const ios = isIos();
  const evaluatedRef = useRef(false);

  const evaluate = useCallback(() => {
    if (standalone) {
      setCanPrompt(false);
      return;
    }
    const dismissedAt = getDismissedAt();
    if (dismissedAt !== null && Date.now() - dismissedAt < DISMISS_TTL_MS) {
      setCanPrompt(false);
      return;
    }
    const visits = getVisits();
    if (visits < MIN_VISITS) {
      setCanPrompt(false);
      return;
    }
    // Android/desktop: need deferredPrompt; iOS: manual A2HS always available after gate
    if (ios) {
      setCanPrompt(true);
    } else {
      setCanPrompt(deferredPrompt !== null);
    }
  }, [deferredPrompt, ios, standalone]);

  useEffect(() => {
    if (evaluatedRef.current) return;
    evaluatedRef.current = true;
    const visits = incrementVisits();
    // Gate depends on visits, so evaluate after increment; deferredPrompt may still be null on first mount.
    // Re-evaluate when deferredPrompt arrives via the listener below.
    if (visits >= MIN_VISITS) {
      // Defer to next tick so deferredPrompt state (if already set) is considered.
      queueMicrotask(() => evaluate());
    }
  }, [evaluate]);

  useEffect(() => {
    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  }, []);

  useEffect(() => {
    evaluate();
  }, [deferredPrompt, evaluate]);

  const prompt = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!deferredPrompt) return 'unavailable';
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      if (choice.outcome === 'accepted') {
        return 'accepted';
      }
      setDismissedNow();
      setCanPrompt(false);
      return 'dismissed';
    } catch {
      return 'unavailable';
    }
  }, [deferredPrompt]);

  const dismiss = useCallback(() => {
    setDismissedNow();
    setCanPrompt(false);
  }, []);

  return {
    canPrompt,
    isIos: ios,
    isStandalone: standalone,
    deferredPrompt,
    prompt,
    dismiss,
  };
}
