import {
  Component,
  inject,
  signal,
} from '@angular/core';

import {
  ComponentFixture,
  TestBed,
} from '@angular/core/testing';

import { vi } from 'vitest';

import { Button } from '../components/button/button';
import { Alert } from '../components/alert/alert';
import { Toast } from '../components/toast/toast';
import { ToastService } from '../services/toast.service';

import type {
  NotificationTone,
} from '../models/notification.models';

@Component({
  standalone: true,
  imports: [Button, Alert, Toast],
  template: `
    <section class="notification-page">
      <h1>Workshop Notifications</h1>

      <fx-button
        data-testid="success"
        (pressed)="notify('success')"
      >
        Confirm Booking
      </fx-button>

      <fx-button
        data-testid="error"
        variant="danger"
        (pressed)="notify('error')"
      >
        Payment Failure
      </fx-button>

      <fx-button
        data-testid="warning"
        (pressed)="notify('warning')"
      >
        Mechanic Availability
      </fx-button>

      <fx-button
        data-testid="info"
        (pressed)="notify('info')"
      >
        New Booking
      </fx-button>

      <fx-button
        data-testid="inline"
        variant="outline"
        (pressed)="inlineVisible.set(true)"
      >
        Show Workshop Alert
      </fx-button>

      <fx-button
        data-testid="clear"
        variant="outline"
        (pressed)="service.clear()"
      >
        Clear Notifications
      </fx-button>

      @if (inlineVisible()) {
        <section class="inline-notification">
          <fx-alert
            tone="warning"
            title="Workshop alert"
            message="Please review pending assignments."
            [dismissible]="true"
            dismissLabel="Close workshop alert"
            (dismissed)="dismissInline()"
          />
        </section>
      }

      <p class="notification-count">
        Active notifications: {{ service.notifications().length }}
      </p>
    </section>

    <fx-toast />
  `,
})
class NotificationIntegrationHost {
  readonly service = inject(ToastService);

  readonly inlineVisible = signal(false);
  readonly inlineDismissals = signal(0);

  notify(tone: NotificationTone): void {
    switch (tone) {
      case 'success':
        this.service.success(
          'Booking confirmed',
          'The booking has been saved successfully.',
        );
        break;

      case 'error':
        this.service.error(
          'Payment failed',
          'Please try again.',
        );
        break;

      case 'warning':
        this.service.warning(
          'Mechanic unavailable',
          'Please assign another mechanic.',
        );
        break;

      case 'info':
        this.service.info(
          'New booking received',
          'A customer has requested a service.',
        );
        break;
    }
  }

  dismissInline(): void {
    this.inlineVisible.set(false);

    this.inlineDismissals.update(
      count => count + 1,
    );
  }
}

describe('Shared UI notification integration', () => {
  let fixture: ComponentFixture<NotificationIntegrationHost>;
  let host: NotificationIntegrationHost;
  let service: ToastService;
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

  function items(): HTMLElement[] {
    return Array.from(
      root.querySelectorAll<HTMLElement>('.fx-toast-item'),
    );
  }

  function titles(): string[] {
    return items().map(item =>
      item.querySelector('.fx-alert-title')
        ?.textContent?.trim() ?? '',
    );
  }

  function render(): void {
    fixture.detectChanges();
  }

  function click(id: string): void {
    find<HTMLButtonElement>(
      `[data-testid="${id}"] button`,
    ).click();

    render();
  }

  function expectToast(
    tone: NotificationTone,
    title: string,
    message: string,
  ): void {
    const item = items().find(element =>
      element.querySelector('.fx-alert-title')
        ?.textContent?.trim() === title,
    );

    expect(item).toBeDefined();

    expect(
      item?.querySelector(`.fx-alert--${tone}`),
    ).not.toBeNull();

    expect(item?.textContent).toContain(title);
    expect(item?.textContent).toContain(message);

    expect(
      item?.querySelector('.fx-alert-copy')
        ?.getAttribute('role'),
    ).toBe(tone === 'error' ? 'alert' : 'status');

    expect(
      item?.querySelector('button')
        ?.getAttribute('aria-label'),
    ).toBe(`Dismiss notification: ${title}`);
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NotificationIntegrationHost],
    }).compileComponents();

    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'Date'],
    });

    fixture = TestBed.createComponent(
      NotificationIntegrationHost,
    );

    host = fixture.componentInstance;
    service = TestBed.inject(ToastService);

    root = fixture.nativeElement as HTMLElement;

    render();
  });

  afterEach(() => {
    try {
      service?.clear();
      fixture?.destroy();
    } finally {
      vi.restoreAllMocks();
      vi.useRealTimers();
    }
  });

  it('NIT-01 renders the initial empty notification state', () => {
    expect(find('h1').textContent)
      .toContain('Workshop Notifications');

    expect(
      root.querySelectorAll('fx-toast').length,
    ).toBe(1);

    expect(
      find('.fx-toast-container')
        .getAttribute('aria-label'),
    ).toBe('Notifications');

    expect(items().length).toBe(0);
    expect(service.notifications()).toEqual([]);

    expect(query('.inline-notification')).toBeNull();

    expect(find('.notification-count').textContent)
      .toContain('Active notifications: 0');

    expect(host.service).toBe(service);
  });

  it('NIT-02 displays success notifications from a feature action', () => {
    click('success');

    expect(items().length).toBe(1);

    expectToast(
      'success',
      'Booking confirmed',
      'The booking has been saved successfully.',
    );

    expect(service.notifications()[0]).toMatchObject({
      tone: 'success',
      title: 'Booking confirmed',
      duration: 5000,
    });

    expect(find('.notification-count').textContent)
      .toContain('Active notifications: 1');
  });

  it('NIT-03 displays persistent error notifications', () => {
    click('error');

    expectToast(
      'error',
      'Payment failed',
      'Please try again.',
    );

    expect(service.notifications()[0].duration)
      .toBe(0);

    vi.advanceTimersByTime(60000);

    render();

    expect(items().length).toBe(1);
    expect(service.notifications().length).toBe(1);
  });

  it('NIT-04 displays persistent warning notifications', () => {
    click('warning');

    expectToast(
      'warning',
      'Mechanic unavailable',
      'Please assign another mechanic.',
    );

    expect(service.notifications()[0].duration)
      .toBe(0);

    vi.advanceTimersByTime(60000);

    render();

    expect(items().length).toBe(1);
  });

  it('NIT-05 displays information notifications from a feature action', () => {
    click('info');

    expectToast(
      'info',
      'New booking received',
      'A customer has requested a service.',
    );

    expect(service.notifications()[0].duration)
      .toBe(5000);

    expect(items().length).toBe(1);
  });

  it('NIT-06 renders multiple notifications in insertion order', () => {
    click('success');
    click('error');
    click('warning');
    click('info');

    expect(items().length).toBe(4);

    expect(titles()).toEqual([
      'Booking confirmed',
      'Payment failed',
      'Mechanic unavailable',
      'New booking received',
    ]);

    expect(
      service.notifications().map(item => item.tone),
    ).toEqual([
      'success',
      'error',
      'warning',
      'info',
    ]);

    expect(
      new Set(
        service.notifications().map(item => item.id),
      ).size,
    ).toBe(4);

    expect(find('.notification-count').textContent)
      .toContain('Active notifications: 4');
  });

  it('NIT-07 dismisses an individual toast without removing others', () => {
    click('success');
    click('error');
    click('warning');

    const errorId = service.notifications()[1].id;

    const button = items()[1]
      .querySelector<HTMLButtonElement>('button');

    expect(button).not.toBeNull();

    button!.click();

    render();

    expect(items().length).toBe(2);

    expect(titles()).toEqual([
      'Booking confirmed',
      'Mechanic unavailable',
    ]);

    expect(
      service.notifications().some(
        item => item.id === errorId,
      ),
    ).toBe(false);

    expect(find('.notification-count').textContent)
      .toContain('Active notifications: 2');
  });

  it('NIT-08 handles inline alert dismissal independently of toasts', () => {
    click('success');
    click('inline');

    expect(host.inlineVisible()).toBe(true);

    expect(find('.inline-notification').textContent)
      .toContain('Workshop alert');

    expect(
      query('.inline-notification .fx-alert--warning'),
    ).not.toBeNull();

    expect(
      find('.inline-notification button')
        .getAttribute('aria-label'),
    ).toBe('Close workshop alert');

    find<HTMLButtonElement>(
      '.inline-notification button',
    ).click();

    render();

    expect(host.inlineVisible()).toBe(false);
    expect(host.inlineDismissals()).toBe(1);

    expect(query('.inline-notification')).toBeNull();

    expect(items().length).toBe(1);

    expect(titles()).toEqual([
      'Booking confirmed',
    ]);

    click('inline');

    expect(host.inlineVisible()).toBe(true);
    expect(query('.inline-notification')).not.toBeNull();
  });

  it('NIT-09 automatically dismisses timed notifications only', () => {
    click('success');
    click('info');
    click('error');
    click('warning');

    vi.advanceTimersByTime(4999);

    render();

    expect(items().length).toBe(4);

    vi.advanceTimersByTime(1);

    render();

    expect(titles()).toEqual([
      'Payment failed',
      'Mechanic unavailable',
    ]);

    expect(service.notifications().length).toBe(2);

    expect(find('.notification-count').textContent)
      .toContain('Active notifications: 2');
  });

  it('NIT-10 pauses and resumes dismissal through mouse events', () => {
    click('success');

    vi.advanceTimersByTime(2000);

    const item = items()[0];

    item.dispatchEvent(
      new MouseEvent('mouseenter'),
    );

    vi.advanceTimersByTime(10000);

    render();

    expect(items().length).toBe(1);
    expect(service.notifications().length).toBe(1);

    item.dispatchEvent(
      new MouseEvent('mouseleave'),
    );

    vi.advanceTimersByTime(2999);

    render();

    expect(items().length).toBe(1);

    vi.advanceTimersByTime(1);

    render();

    expect(items().length).toBe(0);
    expect(service.notifications().length).toBe(0);

    // Verify keyboard focus events also control the timer.
    click('info');

    vi.advanceTimersByTime(1000);

    const focusedItem = items()[0];

    const dismissButton = focusedItem
      .querySelector<HTMLButtonElement>('button')!;

    dismissButton.dispatchEvent(
      new FocusEvent('focusin', {
        bubbles: true,
      }),
    );

    vi.advanceTimersByTime(10000);

    render();

    expect(items().length).toBe(1);

    // Simulate focus leaving while the pointer is outside.
    const originalMatches =
      focusedItem.matches.bind(focusedItem);

    const hoverMock = vi
      .spyOn(focusedItem, 'matches')
      .mockImplementation(selector =>
        selector === ':hover'
          ? false
          : originalMatches(selector),
      );

    dismissButton.dispatchEvent(
      new FocusEvent('focusout', {
        bubbles: true,
        relatedTarget: null,
      }),
    );

    hoverMock.mockRestore();

    vi.advanceTimersByTime(3999);

    render();

    expect(items().length).toBe(1);

    vi.advanceTimersByTime(1);

    render();

    expect(items().length).toBe(0);
  });

  it('NIT-11 enforces the maximum notification stack size', () => {
    click('success');
    click('error');
    click('warning');
    click('info');

    const firstId = service.notifications()[0].id;

    service.info('Notification five', '', 0);
    service.info('Notification six', '', 0);

    render();

    expect(items().length).toBe(5);
    expect(service.notifications().length).toBe(5);

    expect(
      service.notifications().some(
        item => item.id === firstId,
      ),
    ).toBe(false);

    expect(titles()).toEqual([
      'Payment failed',
      'Mechanic unavailable',
      'New booking received',
      'Notification five',
      'Notification six',
    ]);

    expect(find('.notification-count').textContent)
      .toContain('Active notifications: 5');
  });

  it('NIT-12 clears all toasts and supports subsequent notifications', () => {
    click('success');
    click('warning');
    click('error');
    click('info');
    click('inline');

    expect(items().length).toBe(4);

    click('clear');

    expect(items().length).toBe(0);
    expect(service.notifications()).toEqual([]);

    expect(find('.notification-count').textContent)
      .toContain('Active notifications: 0');

    expect(host.inlineVisible()).toBe(true);

    // A newly created toast must not be affected by old timers.
    vi.advanceTimersByTime(1000);

    click('success');

    vi.advanceTimersByTime(4000);

    render();

    expect(items().length).toBe(1);

    vi.advanceTimersByTime(999);

    render();

    expect(items().length).toBe(1);

    vi.advanceTimersByTime(1);

    render();

    expect(items().length).toBe(0);

    click('error');

    expect(items().length).toBe(1);

    click('clear');

    expect(items().length).toBe(0);
  });
});