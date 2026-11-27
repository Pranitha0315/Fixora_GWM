import { getAdaptiveQueueReorderAvailability } from './adaptive-queue-reorder-availability';

describe('getAdaptiveQueueReorderAvailability', () => {
  it('ARA-01 reports reorder as backend-limited and not available', () => {
    const availability = getAdaptiveQueueReorderAvailability();

    expect(availability.status).toBe('backend-limited');
    expect(availability.available).toBe(false);
  });

  it('ARA-02 names the two blocking contract gaps', () => {
    const blocking = getAdaptiveQueueReorderAvailability()
      .gaps.filter(gap => gap.blocking)
      .map(gap => gap.code);

    expect(blocking).toEqual([
      'queue-order-not-exposed',
      'walk-in-link-not-exposed',
    ]);
  });

  it('ARA-03 also records the non-blocking backend risks', () => {
    const risks = getAdaptiveQueueReorderAvailability()
      .gaps.filter(gap => !gap.blocking)
      .map(gap => gap.code);

    expect(risks).toEqual([
      'waiting-status-not-enforced',
      'no-concurrency-protection',
    ]);
  });

  it('ARA-04 explains the gap in short, honest user-facing wording', () => {
    const { message } = getAdaptiveQueueReorderAvailability();

    expect(message.length).toBeLessThan(260);
    expect(message).toContain('not supported');
    expect(message).toContain('stored queue order');
    expect(message).toContain('walk-in');
    expect(message).not.toMatch(/drag|coming soon|try again|retry/i);
    expect(message).not.toMatch(/\b(free|available|vacant|occupied)\b/i);
  });

  it('ARA-05 states that queuePosition is not a queueOrder', () => {
    const detail = getAdaptiveQueueReorderAvailability().gaps[0].detail;

    expect(detail).toContain('queuePosition');
    expect(detail).toContain('not a substitute');
  });

  it('ARA-06 returns the same immutable answer every time', () => {
    const first = getAdaptiveQueueReorderAvailability();
    const second = getAdaptiveQueueReorderAvailability();

    expect(second).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.gaps)).toBe(true);
    expect(first.gaps.every(gap => Object.isFrozen(gap))).toBe(true);
    expect(() => {
      (first as { available: boolean }).available = true;
    }).toThrow();
    expect(first.available).toBe(false);
  });

  it('ARA-07 performs no request and holds no browser state', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const open = vi.spyOn(XMLHttpRequest.prototype, 'open');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    getAdaptiveQueueReorderAvailability();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();

    vi.restoreAllMocks();
  });
});
