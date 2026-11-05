import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetHaptics, haptic, isHapticsSupported, setHapticsEnabled } from '../lib/haptics';

const withVibrate = () => ({ vibrate: vi.fn(() => true) }) as unknown as Navigator & { vibrate: ReturnType<typeof vi.fn> };

beforeEach(() => __resetHaptics());

describe('Haptisches Feedback', () => {
  it('vibriert kurz, wenn die Vibration API unterstützt wird', () => {
    const nav = withVibrate();
    expect(haptic('tap', 1000, nav)).toBe(true);
    expect(nav.vibrate).toHaveBeenCalledWith(6);
  });

  it('nutzt nur sehr kurze Muster', () => {
    const nav = withVibrate();
    haptic('success', 1000, nav);
    const pattern = nav.vibrate.mock.calls[0][0] as number[];
    expect(pattern.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(80);
  });

  it('macht nichts ohne Unterstützung (z. B. iOS Safari)', () => {
    const nav = {} as Navigator;
    expect(isHapticsSupported(nav)).toBe(false);
    expect(haptic('tap', 1000, nav)).toBe(false);
    expect(isHapticsSupported(undefined)).toBe(false);
  });

  it('respektiert die Einstellung „Haptisches Feedback“', () => {
    const nav = withVibrate();
    setHapticsEnabled(false);
    expect(haptic('select', 1000, nav)).toBe(false);
    expect(nav.vibrate).not.toHaveBeenCalled();
  });

  it('löst bei sehr schnellen Wiederholungen nicht dauerhaft aus', () => {
    const nav = withVibrate();
    expect(haptic('tap', 1000, nav)).toBe(true);
    expect(haptic('tap', 1020, nav)).toBe(false);
    expect(haptic('tap', 1100, nav)).toBe(true);
    expect(nav.vibrate).toHaveBeenCalledTimes(2);
  });

  it('fängt Fehler des Browsers ab', () => {
    const nav = { vibrate: () => { throw new Error('blocked'); } } as unknown as Navigator;
    expect(haptic('tap', 1000, nav)).toBe(false);
  });
});
