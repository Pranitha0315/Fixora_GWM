import {
  Component,
  signal,
} from '@angular/core';

import {
  ComponentFixture,
  TestBed,
} from '@angular/core/testing';

import {
  LoadingState,
} from '../components/loading-state/loading-state';

import type {
  LoadingVariant,
} from '../components/loading-state/loading-state';

import {
  EmptyState,
} from '../components/empty-state/empty-state';

import {
  ErrorState,
} from '../components/error-state/error-state';

type PageState =
  | 'loading'
  | 'success'
  | 'empty'
  | 'error';

interface Booking {
  readonly id: string;
  readonly customer: string;
  readonly vehicle: string;
}

const BOOKINGS: readonly Booking[] = [
  {
    id: 'BK-001',
    customer: 'Arun',
    vehicle: 'Toyota Aqua',
  },
  {
    id: 'BK-002',
    customer: 'Kavin',
    vehicle: 'Honda Fit',
  },
  {
    id: 'BK-003',
    customer: 'Priya',
    vehicle: 'Suzuki Swift',
  },
];

@Component({
  standalone: true,
  imports: [
    LoadingState,
    EmptyState,
    ErrorState,
  ],
  template: `
    <section
      class="booking-page"
      [attr.aria-busy]="
        state() === 'loading' || retrying()
          ? 'true'
          : null
      "
    >
      <h1>Workshop Bookings</h1>

      @switch (state()) {
        @case ('loading') {
          <fx-loading-state
            [variant]="loadingVariant()"
            [skeletonRows]="3"
            message="Loading bookings..."
            description="Please wait while we retrieve your records."
          />
        }

        @case ('success') {
          <section class="booking-results">
            <p class="booking-count">
              Showing {{ bookings().length }} bookings
            </p>

            @for (booking of bookings(); track booking.id) {
              <article class="booking-record">
                <span>{{ booking.id }}</span>
                <span>{{ booking.customer }}</span>
                <span>{{ booking.vehicle }}</span>
              </article>
            }
          </section>
        }

        @case ('empty') {
          <fx-empty-state
            title="No bookings found"
            description="There are no bookings to display."
            icon="calendar"
            actionLabel="Refresh bookings"
            actionVariant="outline"
            [actionDisabled]="refreshDisabled()"
            (actionRequested)="refreshBookings()"
          />
        }

        @case ('error') {
          <fx-error-state
            title="Unable to load bookings"
            [description]="errorMessage()"
            retryLabel="Try Again"
            retryLoadingText="Retrying bookings..."
            [retrying]="retrying()"
            [retryDisabled]="retryDisabled()"
            (retryRequested)="retryBookings()"
          />
        }
      }
    </section>
  `,
})
class PageStateIntegrationHost {
  readonly state = signal<PageState>('loading');

  readonly loadingVariant =
    signal<LoadingVariant>('spinner');

  readonly bookings =
    signal<readonly Booking[]>([]);

  readonly errorMessage = signal('');

  readonly retrying = signal(false);
  readonly retryDisabled = signal(false);
  readonly refreshDisabled = signal(false);

  readonly refreshAttempts = signal(0);
  readonly retryAttempts = signal(0);

  resolveBookings(rows: readonly Booking[]): void {
    this.bookings.set([...rows]);
    this.errorMessage.set('');
    this.retrying.set(false);

    this.state.set(
      rows.length > 0 ? 'success' : 'empty',
    );
  }

  failBookings(message: string): void {
    this.bookings.set([]);
    this.errorMessage.set(message);
    this.retrying.set(false);
    this.state.set('error');
  }

  refreshBookings(): void {
    if (
      this.state() !== 'empty' ||
      this.refreshDisabled()
    ) {
      return;
    }

    this.refreshAttempts.update(count => count + 1);
    this.loadingVariant.set('spinner');
    this.state.set('loading');
  }

  retryBookings(): void {
    if (
      this.state() !== 'error' ||
      this.retrying() ||
      this.retryDisabled()
    ) {
      return;
    }

    this.retryAttempts.update(count => count + 1);
    this.retrying.set(true);
  }
}

describe('Shared UI page state integration', () => {
  let fixture: ComponentFixture<PageStateIntegrationHost>;
  let host: PageStateIntegrationHost;
  let root: HTMLElement;

  function query<T extends HTMLElement = HTMLElement>(
    selector: string,
  ): T | null {
    return root.querySelector<T>(selector);
  }

  function find<T extends HTMLElement = HTMLElement>(
    selector: string,
  ): T {
    const result = query<T>(selector);

    if (!result) {
      throw new Error(`Missing element: ${selector}`);
    }

    return result;
  }

  function retryButton(): HTMLButtonElement {
    return find<HTMLButtonElement>(
      'fx-error-state button',
    );
  }

  function refreshButton(): HTMLButtonElement {
    return find<HTMLButtonElement>(
      'fx-empty-state button',
    );
  }

  async function render(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function failRequest(): Promise<void> {
    host.failBookings(
      'Please check your connection and try again.',
    );

    await render();
  }

  function expectOnlyState(state: PageState): void {
    const selectors: Record<PageState, string> = {
      loading: 'fx-loading-state',
      success: '.booking-results',
      empty: 'fx-empty-state',
      error: 'fx-error-state',
    };

    for (const key of Object.keys(selectors) as PageState[]) {
      expect(
        root.querySelectorAll(selectors[key]).length,
      ).toBe(key === state ? 1 : 0);
    }
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PageStateIntegrationHost],
    }).compileComponents();

    fixture = TestBed.createComponent(
      PageStateIntegrationHost,
    );

    host = fixture.componentInstance;
    root = fixture.nativeElement as HTMLElement;

    await render();
  });

  it('PST-01 renders the page in its initial loading state', () => {
    expect(find('h1').textContent)
      .toContain('Workshop Bookings');

    expect(host.state()).toBe('loading');

    expectOnlyState('loading');

    expect(
      find('.booking-page').getAttribute('aria-busy'),
    ).toBe('true');

    expect(host.bookings().length).toBe(0);
  });

  it('PST-02 renders accessible spinner loading content', () => {
    expect(query('.fx-loading-spinner')).not.toBeNull();

    expect(query('.fx-loading-skeleton')).toBeNull();

    expect(find('.fx-loading-message').textContent)
      .toContain('Loading bookings...');

    expect(find('.fx-loading-description').textContent)
      .toContain('Please wait');

    expect(
      find('.fx-loading-state').getAttribute('role'),
    ).toBe('status');

    expect(
      find('.fx-loading-state').getAttribute('aria-live'),
    ).toBe('polite');

    expect(
      find('.fx-loading-spinner').getAttribute('aria-hidden'),
    ).toBe('true');
  });

  it('PST-03 supports skeleton loading within the page', async () => {
    host.loadingVariant.set('skeleton');

    await render();

    expectOnlyState('loading');

    expect(query('.fx-loading-spinner')).toBeNull();

    expect(query('.fx-loading-skeleton')).not.toBeNull();

    expect(
      root.querySelectorAll('.fx-skeleton-row').length,
    ).toBe(3);

    expect(
      find('.fx-loading-skeleton').getAttribute('aria-hidden'),
    ).toBe('true');

    host.loadingVariant.set('spinner');

    await render();

    expect(query('.fx-loading-spinner')).not.toBeNull();
    expect(query('.fx-loading-skeleton')).toBeNull();
  });

  it('PST-04 transitions from loading to successful booking results', async () => {
    host.resolveBookings(BOOKINGS);

    await render();

    expect(host.state()).toBe('success');

    expectOnlyState('success');

    expect(
      root.querySelectorAll('.booking-record').length,
    ).toBe(3);

    expect(find('.booking-count').textContent)
      .toContain('Showing 3 bookings');

    expect(find('.booking-results').textContent)
      .toContain('BK-001');

    expect(find('.booking-results').textContent)
      .toContain('Toyota Aqua');

    expect(
      find('.booking-page').hasAttribute('aria-busy'),
    ).toBe(false);

    expect(host.bookings()).not.toBe(BOOKINGS);
  });

  it('PST-05 transitions from loading to an empty result', async () => {
    host.resolveBookings([]);

    await render();

    expect(host.state()).toBe('empty');

    expectOnlyState('empty');

    expect(find('.fx-empty-title').textContent)
      .toContain('No bookings found');

    expect(find('.fx-empty-description').textContent)
      .toContain('There are no bookings to display.');

    expect(
      find('.fx-empty-copy').getAttribute('role'),
    ).toBe('status');

    expect(refreshButton().textContent)
      .toContain('Refresh bookings');

    expect(
      root.querySelectorAll('.booking-record').length,
    ).toBe(0);
  });

  it('PST-06 transitions from loading to an error state', async () => {
    await failRequest();

    expect(host.state()).toBe('error');

    expectOnlyState('error');

    expect(host.bookings().length).toBe(0);

    expect(query('.fx-error-icon')).not.toBeNull();

    expect(retryButton().disabled).toBe(false);

    expect(
      find('.booking-page').hasAttribute('aria-busy'),
    ).toBe(false);
  });

  it('PST-07 handles empty state refresh and disabled protection', async () => {
    host.resolveBookings([]);
    host.refreshDisabled.set(true);

    await render();

    expect(refreshButton().disabled).toBe(true);

    refreshButton().click();

    await render();

    expect(host.refreshAttempts()).toBe(0);
    expectOnlyState('empty');

    host.refreshDisabled.set(false);

    await render();

    refreshButton().click();

    await render();

    expect(host.refreshAttempts()).toBe(1);
    expect(host.state()).toBe('loading');

    expectOnlyState('loading');

    host.resolveBookings(BOOKINGS);

    await render();

    expectOnlyState('success');
    expect(host.bookings().length).toBe(3);
  });

  it('PST-08 renders the current error message and alert semantics', async () => {
    await failRequest();

    expect(find('.fx-error-title').textContent)
      .toContain('Unable to load bookings');

    expect(find('.fx-error-description').textContent)
      .toContain(
        'Please check your connection and try again.',
      );

    expect(
      find('.fx-error-copy').getAttribute('role'),
    ).toBe('alert');

    expect(
      find('.fx-error-icon').getAttribute('aria-hidden'),
    ).toBe('true');

    host.errorMessage.set('Request timed out.');

    await render();

    expect(find('.fx-error-description').textContent)
      .toContain('Request timed out.');
  });

  it('PST-09 forwards retry events and displays processing state', async () => {
    await failRequest();

    host.retryDisabled.set(true);

    await render();

    expect(retryButton().disabled).toBe(true);

    retryButton().click();

    await render();

    expect(host.retryAttempts()).toBe(0);

    host.retryDisabled.set(false);

    await render();

    retryButton().click();

    await render();

    expect(host.retryAttempts()).toBe(1);
    expect(host.retrying()).toBe(true);

    expectOnlyState('error');

    expect(retryButton().disabled).toBe(true);

    expect(retryButton().textContent)
      .toContain('Retrying bookings...');

    expect(
      find('.booking-page').getAttribute('aria-busy'),
    ).toBe('true');
  });

  it('PST-10 prevents duplicate retries and supports repeated failure', async () => {
    await failRequest();

    const button = retryButton();

    button.click();
    button.click();

    await render();

    expect(host.retryAttempts()).toBe(1);
    expect(host.retrying()).toBe(true);

    retryButton().click();

    await render();

    expect(host.retryAttempts()).toBe(1);

    host.failBookings('The retry request failed.');

    await render();

    expect(host.retrying()).toBe(false);
    expect(retryButton().disabled).toBe(false);

    expect(find('.fx-error-description').textContent)
      .toContain('The retry request failed.');

    retryButton().click();

    await render();

    expect(host.retryAttempts()).toBe(2);
    expect(host.retrying()).toBe(true);
  });

  it('PST-11 recovers successfully after a failed request', async () => {
    await failRequest();

    retryButton().click();

    await render();

    expect(host.retrying()).toBe(true);

    host.resolveBookings(BOOKINGS);

    await render();

    expect(host.retrying()).toBe(false);
    expect(host.errorMessage()).toBe('');
    expect(host.state()).toBe('success');

    expectOnlyState('success');

    expect(query('fx-error-state button')).toBeNull();

    expect(
      root.querySelectorAll('.booking-record').length,
    ).toBe(3);

    expect(host.retryAttempts()).toBe(1);

    expect(
      find('.booking-page').hasAttribute('aria-busy'),
    ).toBe(false);
  });

  it('PST-12 keeps loading, success, empty and error states mutually exclusive', async () => {
    expectOnlyState('loading');

    host.resolveBookings(BOOKINGS);
    await render();

    expectOnlyState('success');

    host.resolveBookings([]);
    await render();

    expectOnlyState('empty');

    refreshButton().click();
    await render();

    expectOnlyState('loading');

    await failRequest();

    expectOnlyState('error');

    retryButton().click();
    await render();

    expectOnlyState('error');

    host.resolveBookings([]);
    await render();

    expectOnlyState('empty');

    expect(host.retrying()).toBe(false);

    expect(host.errorMessage()).toBe('');

    refreshButton().click();
    await render();

    expectOnlyState('loading');

    host.resolveBookings(BOOKINGS);
    await render();

    expectOnlyState('success');

    expect(host.refreshAttempts()).toBe(2);
    expect(host.retryAttempts()).toBe(1);
  });
});