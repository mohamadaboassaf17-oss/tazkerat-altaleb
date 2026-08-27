import { useEffect, useState } from 'react';
import { db } from '../lib/db';
import { useAuth } from '../lib/auth';
import { isTrialExpired, isTrialOpen, trialCountdownLabel, trialDaysRemaining } from '../lib/media';
import type { LocalUser } from '../types/models';

export interface MediaTrialState {
  trialStartedAt: string | null;
  isExpired: boolean;
  isOpen: boolean;
  daysRemaining: number;
  label: string;
  isLoading: boolean;
}

/** Reactive hook: reads users.media_trial_started_at for the current user. */
export function useMediaTrial(): MediaTrialState {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [localUser, setLocalUser] = useState<LocalUser | null | undefined>(undefined);
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    if (!userId) {
      setLocalUser(null);
      return;
    }
    let cancelled = false;
    async function load() {
      const row = await db.users.get(userId as string);
      if (!cancelled) setLocalUser(row ?? null);
    }
    void load();
    const handler = () => void load();
    db.users.hook('creating', handler as unknown as () => void);
    db.users.hook('updating', handler as unknown as () => void);
    db.users.hook('deleting', handler as unknown as () => void);
    return () => {
      cancelled = true;
      db.users.hook('creating').unsubscribe(handler);
      db.users.hook('updating').unsubscribe(handler);
      db.users.hook('deleting').unsubscribe(handler);
    };
  }, [userId]);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  void nowTick;

  if (!userId) {
    return {
      trialStartedAt: null,
      isExpired: false,
      isOpen: true,
      daysRemaining: 30,
      label: trialCountdownLabel(null),
      isLoading: false,
    };
  }

  if (localUser === undefined) {
    return {
      trialStartedAt: null,
      isExpired: false,
      isOpen: true,
      daysRemaining: 30,
      label: 'جارٍ التحميل…',
      isLoading: true,
    };
  }

  const trialStartedAt = localUser?.media_trial_started_at ?? null;
  return {
    trialStartedAt,
    isExpired: isTrialExpired(trialStartedAt),
    isOpen: isTrialOpen(trialStartedAt),
    daysRemaining: trialDaysRemaining(trialStartedAt),
    label: trialCountdownLabel(trialStartedAt),
    isLoading: false,
  };
}
