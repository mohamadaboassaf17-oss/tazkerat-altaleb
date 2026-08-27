import { describe, expect, it } from 'vitest';
import {
  addDays,
  buildTodayQueue,
  coalesceSrsFields,
  compareDueNotes,
  defaultSrsFields,
  isDue,
  nextReview,
  srsPriority,
} from './srs';
import type { SrsFields } from './srs';

const TODAY = '2026-08-26';

function mk(fields: Partial<SrsFields> = {}): SrsFields {
  return {
    type: 'benefit',
    ease_factor: 2.5,
    interval_days: 0,
    repetitions: 0,
    review_date: TODAY,
    ...fields,
  };
}

describe('srs — pure scheduler math', () => {
  it('defaults are 2.5 / 0 / 0', () => {
    expect(defaultSrsFields()).toEqual({ ease_factor: 2.5, interval_days: 0, repetitions: 0 });
  });

  it('easy first review: rep 0→1 => interval 1, حفظ boost => ceil(1*1.15)=2', () => {
    // benefit easy: 1 day
    expect(nextReview(mk(), 'easy', TODAY).interval_days).toBe(1);
    expect(nextReview(mk(), 'easy', TODAY).repetitions).toBe(1);
    expect(nextReview(mk(), 'easy', TODAY).ease_factor).toBeCloseTo(2.65, 5);
    // memorization easy: ladder 1 then ceil(1*1.15)=2
    expect(nextReview(mk({ type: 'memorization' }), 'easy', TODAY).interval_days).toBe(2);
    expect(nextReview(mk({ type: 'memorization' }), 'easy', TODAY).review_date).toBe('2026-08-28');
  });

  it('easy second review: rep 1→2 => interval 6 (benefit) / 7 (memorization)', () => {
    const afterFirst = nextReview(mk(), 'easy', TODAY);
    // feed the result back as the next current
    const cur: SrsFields = { ...mk(), ...afterFirst, interval_days: afterFirst.interval_days, repetitions: afterFirst.repetitions, ease_factor: afterFirst.ease_factor };
    const second = nextReview(cur, 'easy', TODAY);
    expect(second.interval_days).toBe(6);
    expect(second.repetitions).toBe(2);
    expect(second.ease_factor).toBeCloseTo(2.8, 5);

    const afterFirstMemo = nextReview(mk({ type: 'memorization' }), 'easy', TODAY);
    const curMemo: SrsFields = {
      type: 'memorization',
      ease_factor: afterFirstMemo.ease_factor,
      interval_days: afterFirstMemo.interval_days,
      repetitions: afterFirstMemo.repetitions,
      review_date: TODAY,
    };
    const secondMemo = nextReview(curMemo, 'easy', TODAY);
    expect(secondMemo.interval_days).toBe(7); // ceil(6*1.15)=7
  });

  it('easy third review: interval = round(prev * newEase)', () => {
    // start 2.5, after two easies => 2.8, prev interval 6, easy=> 2.95, round(6*2.95)=18
    const c: SrsFields = mk({ ease_factor: 2.8, interval_days: 6, repetitions: 2 });
    const third = nextReview(c, 'easy', TODAY);
    expect(third.interval_days).toBe(18);
    expect(third.ease_factor).toBeCloseTo(2.95, 5);
    // memorization third: ceil(18*1.15)=21
    expect(nextReview({ ...c, type: 'memorization' }, 'easy', TODAY).interval_days).toBe(21);
  });

  it('medium first+second mirrors easy ladder but ease unchanged', () => {
    const first = nextReview(mk(), 'medium', TODAY);
    expect(first.interval_days).toBe(1);
    expect(first.ease_factor).toBe(2.5);
    expect(first.repetitions).toBe(1);

    const second = nextReview({ ...mk(), ...first }, 'medium', TODAY);
    expect(second.interval_days).toBe(6);
    expect(second.ease_factor).toBe(2.5);
  });

  it('medium third: round(prev * 2.5)', () => {
    const c = mk({ ease_factor: 2.5, interval_days: 6, repetitions: 2 });
    expect(nextReview(c, 'medium', TODAY).interval_days).toBe(15); // round(6*2.5)
  });

  it('hard resets repetitions to 0, interval=1, ease -=0.20 floored at 1.30', () => {
    const c = mk({ ease_factor: 1.4, interval_days: 18, repetitions: 5 });
    const r = nextReview(c, 'hard', TODAY);
    expect(r.repetitions).toBe(0);
    expect(r.interval_days).toBe(1);
    expect(r.ease_factor).toBeCloseTo(1.3, 5);
    // hard never gets the حفظ boost
    expect(nextReview({ ...c, type: 'memorization' }, 'hard', TODAY).interval_days).toBe(1);

    const hard2 = nextReview(mk({ ease_factor: 1.3 }), 'hard', TODAY);
    expect(hard2.ease_factor).toBe(1.3);
  });

  it('addDays handles month/leap correctly', () => {
    expect(addDays('2026-08-26', 1)).toBe('2026-08-27');
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29'); // leap
    expect(addDays('2024-02-29', 1)).toBe('2024-03-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-08-26', 6)).toBe('2026-09-01');
  });

  it('srsPriority: memorization 0, others 1', () => {
    expect(srsPriority('memorization')).toBe(0);
    for (const t of ['benefit', 'rule', 'question', 'commentary'] as const) {
      expect(srsPriority(t)).toBe(1);
    }
  });

  it('compareDueNotes: حفظ-first, then review_date ASC, then created_at ASC', () => {
    const a = { type: 'benefit' as const, review_date: '2026-08-26', created_at: '2026-08-26T10:00:00Z' } as Parameters<typeof compareDueNotes>[0];
    const b = { type: 'memorization' as const, review_date: '2026-08-26', created_at: '2026-08-26T11:00:00Z' } as Parameters<typeof compareDueNotes>[0];
    expect(compareDueNotes(a, b)).toBeGreaterThan(0); // b first
    expect(compareDueNotes(b, a)).toBeLessThan(0);

    const early = { type: 'benefit' as const, review_date: '2026-08-25', created_at: '2026-08-26T10:00:00Z' };
    const late = { type: 'benefit' as const, review_date: '2026-08-26', created_at: '2026-08-26T09:00:00Z' };
    expect(compareDueNotes(early, late)).toBeLessThan(0);
  });

  it('buildTodayQueue filters to <= today and sorts', () => {
    const notes = [
      { type: 'benefit' as const, review_date: '2026-08-27', created_at: '2026-08-26T08:00:00Z' }, // future
      { type: 'memorization' as const, review_date: '2026-08-26', created_at: '2026-08-26T09:00:00Z' },
      { type: 'benefit' as const, review_date: '2026-08-26', created_at: '2026-08-26T08:00:00Z' },
      { type: 'benefit' as const, review_date: '2026-08-25', created_at: '2026-08-25T08:00:00Z' },
    ];
    const q = buildTodayQueue(notes, TODAY);
    expect(q).toHaveLength(3);
    // earliest date first within same priority? Actually حفظ-first outranks date here.
    // Order: memo 08-26, then benefit 08-25, then benefit 08-26
    // Wait priority splits first: memo (0) before any benefit (1), regardless of date.
    expect(q[0]!.type).toBe('memorization');
    expect(q[1]!.review_date).toBe('2026-08-25');
    expect(q[2]!.review_date).toBe('2026-08-26');
  });

  it('isDue boundary: today is due, tomorrow is not', () => {
    expect(isDue({ review_date: '2026-08-26' }, '2026-08-26')).toBe(true);
    expect(isDue({ review_date: '2026-08-25' }, '2026-08-26')).toBe(true);
    expect(isDue({ review_date: '2026-08-27' }, '2026-08-26')).toBe(false);
  });

  it('coalesceSrsFields fills missing Dexie v1 fields', () => {
    const raw = { type: 'benefit' as const, review_date: '2026-08-26' } as unknown as SrsFields;
    const c = coalesceSrsFields(raw);
    expect(c.ease_factor).toBe(2.5);
    expect(c.interval_days).toBe(0);
    expect(c.repetitions).toBe(0);
    expect(c.review_date).toBe('2026-08-26');
  });
});
