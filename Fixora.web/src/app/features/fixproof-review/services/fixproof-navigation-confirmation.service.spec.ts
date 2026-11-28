import { TestBed } from '@angular/core/testing';
import { isObservable, type Observable } from 'rxjs';
import { vi } from 'vitest';

import type { FixProofNavigationConfirmationContext } from '../guards/fixproof-mutation-navigation.guard';
import { FixProofNavigationConfirmationService } from './fixproof-navigation-confirmation.service';

function makeContext(
  message = 'A FixProof action is still in progress.',
): FixProofNavigationConfirmationContext {
  return {
    targetUrl: '/dashboard',
    message,
    snapshot: {
      protected: true,
      activeInstanceCount: 1,
      protectedInstanceCount: 1,
      submittingCount: 1,
      uncertainCount: 0,
      reconciliationRequiredCount: 0,
      accessLostUnresolvedCount: 0,
      detachedTransportCount: 0,
      reasons: ['mutation-submitting'],
      allowReauthenticationNavigation: false,
      message,
    },
  };
}

describe('FixProofNavigationConfirmationService (K14)', () => {
  let service: FixProofNavigationConfirmationService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [FixProofNavigationConfirmationService],
    });
    service = TestBed.inject(FixProofNavigationConfirmationService);
  });

  it('FPNC-01 fails closed when no dialog host is registered', () => {
    expect(service.requestConfirmation(makeContext())).toBe(false);
    expect(service.pendingRequest()).toBeNull();
  });

  it('FPNC-02 emits true and clears pendingRequest when confirmed', () => {
    const unregister = service.registerHost();
    const res = service.requestConfirmation(makeContext());
    expect(isObservable(res)).toBe(true);

    const emitted: boolean[] = [];
    let completed = false;
    (res as Observable<boolean>).subscribe({
      next: value => emitted.push(value),
      complete: () => {
        completed = true;
      },
    });

    expect(service.pendingRequest()?.context.targetUrl).toBe('/dashboard');
    service.confirm();

    expect(emitted).toEqual([true]);
    expect(completed).toBe(true);
    expect(service.pendingRequest()).toBeNull();
    unregister();
  });

  it('FPNC-03 emits false and clears pendingRequest when cancelled', () => {
    const unregister = service.registerHost();
    const res = service.requestConfirmation(makeContext()) as Observable<boolean>;

    const emitted: boolean[] = [];
    res.subscribe(value => emitted.push(value));
    service.cancel();

    expect(emitted).toEqual([false]);
    expect(service.pendingRequest()).toBeNull();
    unregister();
  });

  it('FPNC-04 blocks overlapping confirmation prompts (fail-closed)', () => {
    const unregister = service.registerHost();
    const first = service.requestConfirmation(
      makeContext('First prompt'),
    ) as Observable<boolean>;
    const sub = first.subscribe();

    expect(service.requestConfirmation(makeContext('Second prompt'))).toBe(
      false,
    );
    expect(service.pendingRequest()?.context.message).toBe('First prompt');

    sub.unsubscribe();
    expect(service.pendingRequest()).toBeNull();
    unregister();
  });

  it('FPNC-05 settles false on host unregister and ngOnDestroy without leaking pending state', () => {
    const unregister = service.registerHost();
    const nextSpy = vi.fn();
    const res = service.requestConfirmation(makeContext()) as Observable<boolean>;
    res.subscribe(nextSpy);

    unregister();
    expect(nextSpy).toHaveBeenCalledWith(false);
    expect(service.pendingRequest()).toBeNull();

    const unregister2 = service.registerHost();
    const nextSpy2 = vi.fn();
    const res2 = service.requestConfirmation(makeContext()) as Observable<boolean>;
    res2.subscribe(nextSpy2);

    service.ngOnDestroy();
    expect(nextSpy2).toHaveBeenCalledWith(false);
    expect(service.pendingRequest()).toBeNull();
    expect(service.requestConfirmation(makeContext())).toBe(false);
    unregister2();
  });
});
