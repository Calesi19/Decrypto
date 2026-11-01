import { useCallback, useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// beforeinstallprompt can fire before React mounts, so it is caught at module load.
let deferredPrompt: InstallPromptEvent | null = null;
const promptListeners = new Set<() => void>();

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event as InstallPromptEvent;
  promptListeners.forEach((listener) => listener());
});

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIosSafari(): boolean {
  const iPadOs = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || iPadOs;
}

export function useInstall() {
  const [canPrompt, setCanPrompt] = useState(!!deferredPrompt);

  useEffect(() => {
    const listener = () => setCanPrompt(true);
    promptListeners.add(listener);
    return () => {
      promptListeners.delete(listener);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    setCanPrompt(false);
  }, []);

  const installed = isStandalone();
  return { canPrompt: canPrompt && !installed, showIosHint: isIosSafari() && !installed, install };
}

export function useAppUpdate() {
  const [update, setUpdate] = useState<(() => void) | null>(null);

  useEffect(() => {
    if (!import.meta.env.PROD) return;
    const apply = registerSW({
      onNeedRefresh: () => setUpdate(() => () => void apply(true)),
    });
  }, []);

  return update;
}

export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (cancelled) void lock.release();
        else sentinel = lock;
      } catch {
        // Denied on low battery; the game still works, the screen may just dim.
      }
    };

    void acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', acquire);
      void sentinel?.release();
    };
  }, [active]);
}
