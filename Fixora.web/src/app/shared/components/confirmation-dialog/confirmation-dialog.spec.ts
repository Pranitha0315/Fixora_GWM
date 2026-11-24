import {
  ComponentFixture,
  TestBed,
} from '@angular/core/testing';

import { vi } from 'vitest';

import { ConfirmationDialog } from './confirmation-dialog';

// Native dialog compatibility for the unit test environment.
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

  return () => {
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

describe('ConfirmationDialog', () => {
  let fixture: ComponentFixture<ConfirmationDialog>;
  let component: ConfirmationDialog;

  function actionButtons(): NodeListOf<HTMLButtonElement> {
    return fixture.nativeElement.querySelectorAll(
      '.fx-confirm-actions button',
    );
  }

  let restoreDialogTestMethods: (() => void) | undefined;

  beforeEach(async () => {
    restoreDialogTestMethods = installDialogTestMethods();
    vi.spyOn(HTMLDialogElement.prototype, 'showModal')
      .mockImplementation(function (this: HTMLDialogElement) {
        this.setAttribute('open', '');
      });

    vi.spyOn(HTMLDialogElement.prototype, 'close')
      .mockImplementation(function (this: HTMLDialogElement) {
        this.removeAttribute('open');
      });

    await TestBed.configureTestingModule({
      imports: [ConfirmationDialog],
    }).compileComponents();

    fixture = TestBed.createComponent(ConfirmationDialog);
    component = fixture.componentInstance;

    fixture.componentRef.setInput(
      'dialogId',
      'confirm-test',
    );

    fixture.componentRef.setInput(
      'message',
      'Do you want to continue?',
    );

    fixture.componentRef.setInput('open', true);

    fixture.detectChanges();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreDialogTestMethods?.();
    restoreDialogTestMethods = undefined;
  });

  it('should create the confirmation dialog', () => {
    expect(component).toBeTruthy();
  });

  it('should render the default title', () => {
    expect(
      fixture.nativeElement.querySelector('h2')?.textContent,
    ).toContain('Confirm action');
  });

  it('should render the confirmation message', () => {
    expect(
      fixture.nativeElement.querySelector(
        '.fx-confirm-message',
      )?.textContent,
    ).toContain('Do you want to continue?');
  });

  it('should support a custom title', () => {
    fixture.componentRef.setInput('title', 'Delete Booking?');
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('h2')?.textContent,
    ).toContain('Delete Booking?');
  });

  it('should render both action buttons', () => {
    expect(actionButtons().length).toBe(2);
    expect(actionButtons()[0].textContent).toContain('Cancel');
    expect(actionButtons()[1].textContent).toContain('Confirm');
  });

  it('should support custom action labels', () => {
    fixture.componentRef.setInput('confirmText', 'Delete');
    fixture.componentRef.setInput('cancelText', 'Keep');

    fixture.detectChanges();

    expect(actionButtons()[0].textContent).toContain('Keep');
    expect(actionButtons()[1].textContent).toContain('Delete');
  });

  it('should support all four semantic tones', () => {
    for (const tone of ['primary', 'danger', 'warning', 'success']) {
      fixture.componentRef.setInput('tone', tone);
      fixture.detectChanges();

      expect(
        fixture.nativeElement.querySelector(
          `.fx-confirm-icon--${tone}`,
        ),
      ).not.toBeNull();
    }
  });

  it('should use a danger button for destructive actions', () => {
    fixture.componentRef.setInput('tone', 'danger');

    expect(component.buttonVariant()).toBe('danger');
  });

  it('should use the primary button by default', () => {
    expect(component.buttonVariant()).toBe('primary');
  });

  it('should emit confirmation from the confirm button', () => {
    const handler = vi.fn();

    component.confirmed.subscribe(handler);

    actionButtons()[1].click();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should emit cancellation from the cancel button', () => {
    const handler = vi.fn();

    component.cancelled.subscribe(handler);

    actionButtons()[0].click();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should treat a modal close request as cancellation', () => {
    const handler = vi.fn();

    component.cancelled.subscribe(handler);

    component.handleClose('button');

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should treat Escape as cancellation', () => {
    const handler = vi.fn();

    component.cancelled.subscribe(handler);

    const dialog: HTMLDialogElement =
      fixture.nativeElement.querySelector('dialog');

    dialog.dispatchEvent(
      new Event('cancel', { cancelable: true }),
    );

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should block confirmation while busy', () => {
    fixture.componentRef.setInput('busy', true);

    const handler = vi.fn();

    component.confirmed.subscribe(handler);
    component.confirm();

    expect(handler).not.toHaveBeenCalled();
  });

  it('should block cancellation while busy', () => {
    fixture.componentRef.setInput('busy', true);

    const handler = vi.fn();

    component.cancelled.subscribe(handler);
    component.cancel();
    component.handleClose('escape');

    expect(handler).not.toHaveBeenCalled();
  });

  it('should disable both action buttons while busy', () => {
    fixture.componentRef.setInput('busy', true);
    fixture.detectChanges();

    expect(actionButtons()[0].disabled).toBe(true);
    expect(actionButtons()[1].disabled).toBe(true);
  });

  it('should display the processing label while busy', () => {
    fixture.componentRef.setInput('busy', true);
    fixture.componentRef.setInput(
      'processingText',
      'Saving changes...',
    );

    fixture.detectChanges();

    expect(actionButtons()[1].textContent)
      .toContain('Saving changes...');
  });

  it('should support explicitly disabling confirmation', () => {
    fixture.componentRef.setInput('confirmDisabled', true);
    fixture.detectChanges();

    expect(actionButtons()[1].disabled).toBe(true);
    expect(actionButtons()[0].disabled).toBe(false);
  });

  it('should not emit explicitly disabled confirmations', () => {
    fixture.componentRef.setInput('confirmDisabled', true);

    const handler = vi.fn();

    component.confirmed.subscribe(handler);
    component.confirm();

    expect(handler).not.toHaveBeenCalled();
  });

  it('should ignore actions when closed', () => {
    fixture.componentRef.setInput('open', false);

    const confirmHandler = vi.fn();
    const cancelHandler = vi.fn();

    component.confirmed.subscribe(confirmHandler);
    component.cancelled.subscribe(cancelHandler);

    component.confirm();
    component.cancel();

    expect(confirmHandler).not.toHaveBeenCalled();
    expect(cancelHandler).not.toHaveBeenCalled();
  });

  it('should hide decorative icons from assistive technology', () => {
    expect(
      fixture.nativeElement.querySelector(
        '.fx-confirm-icon',
      )?.getAttribute('aria-hidden'),
    ).toBe('true');
  });

  it('should render messages as plain text', () => {
    fixture.componentRef.setInput(
      'message',
      '<b>Confirm this</b>',
    );

    fixture.detectChanges();

    const message: HTMLElement =
      fixture.nativeElement.querySelector(
        '.fx-confirm-message',
      );

    expect(message.textContent).toContain('<b>Confirm this</b>');
    expect(message.querySelector('b')).toBeNull();
  });
});