import {
  Component,
  signal,
} from '@angular/core';

import {
  ComponentFixture,
  TestBed,
} from '@angular/core/testing';

import { vi } from 'vitest';

import { Button } from '../components/button/button';
import { Modal } from '../components/modal/modal';

import {
  ConfirmationDialog,
} from '../components/confirmation-dialog/confirmation-dialog';

import type {
  ModalCloseReason,
} from '../components/modal/modal';

function installDialogTestMethods(): () => void {
  const prototype = HTMLDialogElement.prototype;

  const originalShowModal =
    Object.getOwnPropertyDescriptor(prototype, 'showModal');

  const originalClose =
    Object.getOwnPropertyDescriptor(prototype, 'close');

  if (typeof prototype.showModal !== 'function') {
    Object.defineProperty(prototype, 'showModal', {
      configurable: true,
      writable: true,
      value: function (this: HTMLDialogElement): void {
        this.setAttribute('open', '');
      },
    });
  }

  if (typeof prototype.close !== 'function') {
    Object.defineProperty(prototype, 'close', {
      configurable: true,
      writable: true,
      value: function (this: HTMLDialogElement): void {
        this.removeAttribute('open');
      },
    });
  }

  vi.spyOn(prototype, 'showModal')
    .mockImplementation(function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    });

  vi.spyOn(prototype, 'close')
    .mockImplementation(function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    });

  return () => {
    vi.restoreAllMocks();

    if (originalShowModal) {
      Object.defineProperty(
        prototype,
        'showModal',
        originalShowModal,
      );
    } else {
      Reflect.deleteProperty(prototype, 'showModal');
    }

    if (originalClose) {
      Object.defineProperty(
        prototype,
        'close',
        originalClose,
      );
    } else {
      Reflect.deleteProperty(prototype, 'close');
    }
  };
}

@Component({
  standalone: true,
  imports: [Button, Modal, ConfirmationDialog],
  template: `
    <p class="booking-status">
      {{ bookingStatus() }}
    </p>

    <fx-button
      data-testid="open-details"
      (pressed)="detailsOpen.set(true)"
    >
      View Booking
    </fx-button>

    <fx-button
      data-testid="open-confirmation"
      variant="danger"
      [disabled]="bookingStatus() === 'Cancelled'"
      (pressed)="confirmationOpen.set(true)"
    >
      Cancel Booking
    </fx-button>

    <fx-modal
      dialogId="booking-details-dialog"
      title="Booking Details"
      [open]="detailsOpen()"
      (closeRequested)="closeDetails($event)"
    >
      <p class="booking-information">
        Booking BK-001 - Toyota Aqua
      </p>

      <fx-button
        modal-footer
        data-testid="close-details"
        variant="outline"
        (pressed)="detailsOpen.set(false)"
      >
        Done
      </fx-button>
    </fx-modal>

    <fx-confirmation-dialog
      dialogId="booking-confirmation-dialog"
      title="Cancel this booking?"
      message="Are you sure you want to cancel booking BK-001?"
      tone="danger"
      confirmText="Confirm"
      cancelText="Go Back"
      processingText="Cancelling..."
      [open]="confirmationOpen()"
      [busy]="busy()"
      [confirmDisabled]="confirmDisabled()"
      (confirmed)="confirmCancellation()"
      (cancelled)="cancelConfirmation()"
    />
  `,
})
class DialogIntegrationHost {
  readonly detailsOpen = signal(false);
  readonly confirmationOpen = signal(false);

  readonly busy = signal(false);
  readonly confirmDisabled = signal(false);

  readonly bookingStatus =
    signal<'Confirmed' | 'Cancelled'>('Confirmed');

  readonly confirmationCount = signal(0);
  readonly cancellationCount = signal(0);

  readonly closeReason =
    signal<ModalCloseReason | null>(null);

  closeDetails(reason: ModalCloseReason): void {
    this.closeReason.set(reason);
    this.detailsOpen.set(false);
  }

  confirmCancellation(): void {
    if (
      !this.confirmationOpen() ||
      this.busy() ||
      this.confirmDisabled() ||
      this.bookingStatus() === 'Cancelled'
    ) {
      return;
    }

    this.busy.set(true);
    this.confirmationCount.update(count => count + 1);
  }

  completeCancellation(): void {
    if (!this.busy()) {
      return;
    }

    this.bookingStatus.set('Cancelled');
    this.confirmationOpen.set(false);
    this.busy.set(false);
  }

  cancelConfirmation(): void {
    if (!this.confirmationOpen() || this.busy()) {
      return;
    }

    this.cancellationCount.update(count => count + 1);
    this.confirmationOpen.set(false);
  }
}

describe('Shared UI dialog integration', () => {
  let fixture: ComponentFixture<DialogIntegrationHost>;
  let host: DialogIntegrationHost;
  let root: HTMLElement;

  let restoreDialogMethods: (() => void) | undefined;

  function find<T extends HTMLElement>(
    selector: string,
  ): T {
    const result = root.querySelector<T>(selector);

    if (!result) {
      throw new Error(`Missing element: ${selector}`);
    }

    return result;
  }

  function detailsDialog(): HTMLDialogElement {
    return find<HTMLDialogElement>(
      '#booking-details-dialog',
    );
  }

  function confirmationDialog(): HTMLDialogElement {
    return find<HTMLDialogElement>(
      '#booking-confirmation-dialog',
    );
  }

  function actionButtons(): HTMLButtonElement[] {
    return Array.from(
      confirmationDialog()
        .querySelectorAll<HTMLButtonElement>(
          '.fx-confirm-actions button',
        ),
    );
  }

  function backButton(): HTMLButtonElement {
    return actionButtons()[0];
  }

  function confirmButton(): HTMLButtonElement {
    return actionButtons()[1];
  }

  async function render(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function click(selector: string): Promise<void> {
    find<HTMLButtonElement>(selector).click();
    await render();
  }

  async function openDetails(): Promise<void> {
    await click('[data-testid="open-details"] button');
  }

  async function openConfirmation(): Promise<void> {
    await click('[data-testid="open-confirmation"] button');
  }

  function escape(dialog: HTMLDialogElement): Event {
    const event = new Event('cancel', {
      cancelable: true,
    });

    dialog.dispatchEvent(event);

    return event;
  }

  beforeEach(async () => {
    restoreDialogMethods = installDialogTestMethods();

    await TestBed.configureTestingModule({
      imports: [DialogIntegrationHost],
    }).compileComponents();

    fixture = TestBed.createComponent(
      DialogIntegrationHost,
    );

    host = fixture.componentInstance;
    root = fixture.nativeElement as HTMLElement;

    await render();
  });

  afterEach(() => {
    try {
      fixture?.destroy();
    } finally {
      restoreDialogMethods?.();
      restoreDialogMethods = undefined;
    }
  });

  it('DLG-01 renders all dialog components initially closed', () => {
    expect(
      root.querySelector('fx-confirmation-dialog'),
    ).not.toBeNull();

    expect(
      root.querySelectorAll('dialog').length,
    ).toBe(2);

    expect(detailsDialog().open).toBe(false);
    expect(confirmationDialog().open).toBe(false);

    expect(host.bookingStatus()).toBe('Confirmed');

    expect(
      find<HTMLButtonElement>(
        '[data-testid="open-details"] button',
      ).disabled,
    ).toBe(false);
  });

  it('DLG-02 opens the details modal through a shared button', async () => {
    await openDetails();

    expect(host.detailsOpen()).toBe(true);
    expect(detailsDialog().open).toBe(true);

    expect(
      detailsDialog().getAttribute('aria-modal'),
    ).toBe('true');

    expect(confirmationDialog().open).toBe(false);
  });

  it('DLG-03 displays projected modal content and footer', async () => {
    await openDetails();

    expect(
      detailsDialog().querySelector('h2')?.textContent,
    ).toContain('Booking Details');

    expect(
      detailsDialog()
        .querySelector('.fx-modal-body .booking-information')
        ?.textContent,
    ).toContain('Booking BK-001 - Toyota Aqua');

    expect(
      detailsDialog()
        .querySelector('.fx-modal-footer fx-button')
        ?.textContent,
    ).toContain('Done');
  });

  it('DLG-04 closes the modal through close and footer buttons', async () => {
    await openDetails();

    await click(
      '#booking-details-dialog .fx-modal-close',
    );

    expect(host.detailsOpen()).toBe(false);
    expect(host.closeReason()).toBe('button');
    expect(detailsDialog().open).toBe(false);

    await openDetails();

    await click('[data-testid="close-details"] button');

    expect(detailsDialog().open).toBe(false);
    expect(host.bookingStatus()).toBe('Confirmed');
  });

  it('DLG-05 opens the booking confirmation dialog', async () => {
    await openConfirmation();

    expect(host.confirmationOpen()).toBe(true);
    expect(confirmationDialog().open).toBe(true);

    expect(
      confirmationDialog().querySelector('h2')?.textContent,
    ).toContain('Cancel this booking?');

    expect(
      confirmationDialog()
        .querySelector('.fx-confirm-message')
        ?.textContent,
    ).toContain(
      'Are you sure you want to cancel booking BK-001?',
    );

    expect(
      confirmationDialog()
        .querySelector('.fx-confirm-icon--danger'),
    ).not.toBeNull();

    expect(backButton().textContent).toContain('Go Back');
    expect(confirmButton().textContent).toContain('Confirm');
  });

  it('DLG-06 confirms and completes a simulated cancellation', async () => {
    await openConfirmation();

    confirmButton().click();
    await render();

    expect(host.confirmationCount()).toBe(1);
    expect(host.busy()).toBe(true);

    expect(host.bookingStatus()).toBe('Confirmed');
    expect(confirmationDialog().open).toBe(true);

    host.completeCancellation();
    await render();

    expect(host.bookingStatus()).toBe('Cancelled');
    expect(host.busy()).toBe(false);
    expect(confirmationDialog().open).toBe(false);

    expect(find('.booking-status').textContent)
      .toContain('Cancelled');

    expect(
      find<HTMLButtonElement>(
        '[data-testid="open-confirmation"] button',
      ).disabled,
    ).toBe(true);
  });

  it('DLG-07 cancels confirmation without changing booking data', async () => {
    await openConfirmation();

    backButton().click();
    await render();

    expect(host.cancellationCount()).toBe(1);
    expect(host.confirmationCount()).toBe(0);

    expect(host.bookingStatus()).toBe('Confirmed');
    expect(confirmationDialog().open).toBe(false);
  });

  it('DLG-08 prevents duplicate confirmation requests', async () => {
    await openConfirmation();

    const button = confirmButton();

    button.click();
    button.click();

    await render();

    expect(host.confirmationCount()).toBe(1);
    expect(host.busy()).toBe(true);
    expect(confirmButton().disabled).toBe(true);

    confirmButton().click();
    await render();

    expect(host.confirmationCount()).toBe(1);
  });

  it('DLG-09 protects the dialog while cancellation is processing', async () => {
    await openConfirmation();

    confirmButton().click();
    await render();

    expect(confirmButton().disabled).toBe(true);
    expect(backButton().disabled).toBe(true);

    expect(confirmButton().textContent)
      .toContain('Cancelling...');

    expect(
      confirmationDialog().getAttribute('aria-busy'),
    ).toBe('true');

    expect(
      confirmationDialog().querySelector('.fx-modal-close'),
    ).toBeNull();

    backButton().click();

    const event = escape(confirmationDialog());

    await render();

    expect(event.defaultPrevented).toBe(true);
    expect(host.cancellationCount()).toBe(0);
    expect(host.confirmationCount()).toBe(1);
    expect(confirmationDialog().open).toBe(true);
  });

  it('DLG-10 blocks explicitly disabled confirmation', async () => {
    host.confirmDisabled.set(true);

    await openConfirmation();

    expect(confirmButton().disabled).toBe(true);
    expect(backButton().disabled).toBe(false);

    confirmButton().click();
    await render();

    expect(host.confirmationCount()).toBe(0);
    expect(host.busy()).toBe(false);
    expect(host.bookingStatus()).toBe('Confirmed');

    host.confirmDisabled.set(false);

    await render();

    expect(confirmButton().disabled).toBe(false);
  });

  it('DLG-11 routes native cancel events to the parent', async () => {
    await openDetails();

    const detailsEvent = escape(detailsDialog());

    await render();

    expect(detailsEvent.defaultPrevented).toBe(true);
    expect(host.closeReason()).toBe('escape');
    expect(detailsDialog().open).toBe(false);

    await openConfirmation();

    const confirmEvent = escape(confirmationDialog());

    await render();

    expect(confirmEvent.defaultPrevented).toBe(true);
    expect(host.cancellationCount()).toBe(1);
    expect(host.confirmationCount()).toBe(0);
    expect(confirmationDialog().open).toBe(false);
    expect(host.bookingStatus()).toBe('Confirmed');
  });

  it('DLG-12 reopens confirmation after dismissal', async () => {
    await openConfirmation();

    backButton().click();
    await render();

    expect(confirmationDialog().open).toBe(false);

    await openConfirmation();

    expect(confirmationDialog().open).toBe(true);
    expect(confirmButton().disabled).toBe(false);
    expect(host.busy()).toBe(false);

    expect(
      confirmationDialog()
        .querySelector('.fx-confirm-message')
        ?.textContent,
    ).toContain('BK-001');

    await click(
      '#booking-confirmation-dialog .fx-modal-close',
    );

    expect(host.cancellationCount()).toBe(2);
    expect(host.confirmationCount()).toBe(0);
    expect(confirmationDialog().open).toBe(false);
    expect(host.bookingStatus()).toBe('Confirmed');
  });
});