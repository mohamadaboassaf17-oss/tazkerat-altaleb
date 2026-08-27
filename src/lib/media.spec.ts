import { describe, expect, it } from 'vitest';
import {
  bucketForKind,
  extForMime,
  isTrialExpired,
  isTrialOpen,
  MEDIA_AUDIO_MAX_SECONDS,
  MEDIA_TRIAL_DAYS,
  trialCountdownLabel,
  trialDaysRemaining,
  validateFileForKind,
} from './media';

describe('bucketForKind', () => {
  it('maps image → media-images', () => expect(bucketForKind('image')).toBe('media-images'));
  it('maps audio → media-audio', () => expect(bucketForKind('audio')).toBe('media-audio'));
});

describe('extForMime', () => {
  it('maps known mimes', () => {
    expect(extForMime('image/jpeg')).toBe('jpg');
    expect(extForMime('audio/mpeg')).toBe('mp3');
  });
  it('falls back to bin', () => expect(extForMime('application/octet-stream')).toBe('bin'));
});

describe('validateFileForKind', () => {
  it('rejects empty file', () => {
    const f = new File([], 'a.png', { type: 'image/png' });
    // File.size is 0 for empty
    expect(validateFileForKind(f, 'image').ok).toBe(false);
  });
  it('rejects oversized file', () => {
    const big = new File([new Uint8Array(11 * 1024 * 1024)], 'big.png', { type: 'image/png' });
    const r = validateFileForKind(big, 'image');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch('10');
  });
  it('accepts valid image', () => {
    const f = new File([new Uint8Array(10)], 'a.jpg', { type: 'image/jpeg' });
    expect(validateFileForKind(f, 'image')).toEqual({ ok: true });
  });
  it('rejects image mime for audio gate mismatch via image set', () => {
    // audio kind should reject non-audio mime that is not audio/*
    const pngAsAudio = new File([new Uint8Array(10)], 'a.png', { type: 'image/png' });
    expect(validateFileForKind(pngAsAudio, 'audio').ok).toBe(false);
  });
});

describe('trial window', () => {
  it('null trial is open with full days', () => {
    expect(isTrialOpen(null)).toBe(true);
    expect(isTrialExpired(null)).toBe(false);
    expect(trialDaysRemaining(null)).toBe(MEDIA_TRIAL_DAYS);
  });
  it('31 days ago is expired', () => {
    const past = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    expect(isTrialOpen(past)).toBe(false);
    expect(isTrialExpired(past)).toBe(true);
    expect(trialDaysRemaining(past)).toBe(0);
  });
  it('29 days ago is still open with 1 day remaining', () => {
    // Use a value slightly less than 29 days to avoid flakiness near boundary
    const past = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000 + 60_000).toISOString();
    expect(isTrialOpen(past)).toBe(true);
    const days = trialDaysRemaining(past);
    expect(days).toBeGreaterThanOrEqual(1);
    expect(days).toBeLessThanOrEqual(2);
  });
  it('countdown label mentions expiry', () => {
    const past = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    expect(trialCountdownLabel(past)).toMatch('انتهت');
  });
  it('countdown label for never-started mentions لم تبدأ', () => {
    expect(trialCountdownLabel(null)).toMatch('لم تبدأ');
  });
  it('audio max seconds is 300', () => {
    expect(MEDIA_AUDIO_MAX_SECONDS).toBe(300);
  });
});
