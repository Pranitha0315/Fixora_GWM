import {
  Component,
  signal,
} from '@angular/core';

import {
  ComponentFixture,
  TestBed,
} from '@angular/core/testing';

import { vi } from 'vitest';

import { Modal } from './modal';
import type { ModalCloseReason } from './modal';

@Component({
  standalone: true,
  imports: [Modal],
  template: `
    <fx-modal
      dialogId="host-modal"
      title="Test dialog"
      [open]="open()"
      (closeRequested)="handleClose($event)"
    >
      <p class="test-content">Projected body</p>

      <div modal-footer class="test-footer">
        Projected footer
      </div>
    </fx-modal>
  `,
})
class ModalTestHost {
  readonly open = signal(true);
  readonly reason = signal<ModalCloseReason | null>(null);

  handleClose(reason: ModalCloseReason): void {
    this.reason.set(reason);
    this.open.set(false);
  }
}

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

describe('Modal', () => {
  let fixture: ComponentFixture<Modal>;
  let component: Modal;

  let showModalSpy: ReturnType<typeof vi.spyOn>;
  let closeSpy: ReturnType<typeof vi.spyOn>;

  function dialog(): HTMLDialogElement {
    return fixture.nativeElement.querySelector('dialog');
  }

  function setOpen(open: boolean): void {
    fixture.componentRef.setInput('open', open);
    fixture.detectChanges();
  }

  let restoreDialogTestMethods: (() => void) | undefined;

  beforeEach(async () => {
    restoreDialogTestMethods = installDialogTestMethods();
    // Simulate native dialog state in the unit test environment.
    // Actual browser behaviour is verified separately.

    showModalSpy = vi
      .spyOn(HTMLDialogElement.prototype, 'showModal')
      .mockImplementation(function (this: HTMLDialogElement) {
        this.setAttribute('open', '');
      });

    closeSpy = vi
      .spyOn(HTMLDialogElement.prototype, 'close')
      .mockImplementation(function (this: HTMLDialogElement) {
        this.removeAttribute('open');
      });

    await TestBed.configureTestingModule({
      imports: [Modal, ModalTestHost],
    }).compileComponents();

    fixture = TestBed.createComponent(Modal);
    component = fixture.componentInstance;

    fixture.componentRef.setInput('dialogId', 'test-modal');
    fixture.componentRef.setInput('title', 'Vehicle details');

    fixture.detectChanges();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreDialogTestMethods?.();
    restoreDialogTestMethods = undefined;
  });

  it('should create the modal', () => {
    expect(component).toBeTruthy();
  });

  it('should remain closed by default', () => {
    expect(dialog().open).toBe(false);
  });

  it('should open through the native dialog method', () => {
    setOpen(true);

    expect(showModalSpy).toHaveBeenCalled();
    expect(dialog().open).toBe(true);
  });

  it('should close when the open input becomes false', () => {
    setOpen(true);
    setOpen(false);

    expect(closeSpy).toHaveBeenCalled();
    expect(dialog().open).toBe(false);
  });

  it('should render the dialog title', () => {
    expect(dialog().querySelector('h2')?.textContent)
      .toContain('Vehicle details');
  });

  it('should associate the dialog with its title', () => {
    expect(dialog().getAttribute('aria-labelledby'))
      .toBe('test-modal-title');

    expect(dialog().querySelector('h2')?.id)
      .toBe('test-modal-title');
  });

  it('should expose modal semantics when open', () => {
    setOpen(true);

    expect(dialog().getAttribute('aria-modal'))
      .toBe('true');
  });

  it('should support all four modal sizes', () => {
    for (const size of ['sm', 'md', 'lg', 'xl']) {
      fixture.componentRef.setInput('size', size);
      fixture.detectChanges();

      expect(dialog().classList.contains(`fx-modal--${size}`))
        .toBe(true);
    }
  });

  it('should emit a close request from the close button', () => {
    setOpen(true);

    const handler = vi.fn();

    component.closeRequested.subscribe(handler);

    const button = dialog().querySelector(
      '.fx-modal-close',
    ) as HTMLButtonElement;

    button.click();

    expect(handler).toHaveBeenCalledWith('button');
  });

  it('should allow the parent to control closing', () => {
    setOpen(true);

    component.requestClose('button');

    expect(component.open()).toBe(true);
    expect(dialog().open).toBe(true);
  });

  it('should prevent default native cancel behaviour', () => {
    setOpen(true);

    const event = new Event('cancel', {
      cancelable: true,
    });

    dialog().dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('should emit a close request for Escape', () => {
    setOpen(true);

    const handler = vi.fn();

    component.closeRequested.subscribe(handler);

    dialog().dispatchEvent(
      new Event('cancel', { cancelable: true }),
    );

    expect(handler).toHaveBeenCalledWith('escape');
  });

  it('should allow Escape closing to be disabled', () => {
    setOpen(true);

    fixture.componentRef.setInput('closeOnEscape', false);

    const handler = vi.fn();

    component.closeRequested.subscribe(handler);
    component.requestClose('escape');

    expect(handler).not.toHaveBeenCalled();
  });

  it('should disable backdrop closing by default', () => {
    setOpen(true);

    const handler = vi.fn();

    component.closeRequested.subscribe(handler);
    component.requestClose('backdrop');

    expect(handler).not.toHaveBeenCalled();
  });

  it('should support optional backdrop closing', () => {
    setOpen(true);

    fixture.componentRef.setInput('closeOnBackdrop', true);

    const handler = vi.fn();

    component.closeRequested.subscribe(handler);

    dialog().dispatchEvent(
      new MouseEvent('click', {
        clientX: 100,
        clientY: 100,
      }),
    );

    expect(handler).toHaveBeenCalledWith('backdrop');
  });

  it('should not treat body content clicks as backdrop clicks', () => {
    setOpen(true);

    fixture.componentRef.setInput('closeOnBackdrop', true);

    const handler = vi.fn();

    component.closeRequested.subscribe(handler);

    dialog().querySelector('.fx-modal-body')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );

    expect(handler).not.toHaveBeenCalled();
  });

  it('should hide close controls when not dismissible', () => {
    fixture.componentRef.setInput('dismissible', false);
    fixture.detectChanges();

    expect(dialog().querySelector('.fx-modal-close'))
      .toBeNull();
  });

  it('should block closing when not dismissible', () => {
    setOpen(true);

    fixture.componentRef.setInput('dismissible', false);

    const handler = vi.fn();

    component.closeRequested.subscribe(handler);
    component.requestClose('button');
    component.requestClose('escape');

    expect(handler).not.toHaveBeenCalled();
  });

  it('should prevent dismissal while busy', () => {
    setOpen(true);

    fixture.componentRef.setInput('busy', true);

    const handler = vi.fn();

    component.closeRequested.subscribe(handler);
    component.requestClose('button');
    component.requestClose('escape');
    component.requestClose('backdrop');

    expect(handler).not.toHaveBeenCalled();
  });

  it('should expose busy state and disable the close button', () => {
    setOpen(true);

    fixture.componentRef.setInput('busy', true);
    fixture.detectChanges();

    expect(dialog().getAttribute('aria-busy')).toBe('true');

    const button = dialog().querySelector(
      '.fx-modal-close',
    ) as HTMLButtonElement;

    expect(button.disabled).toBe(true);
  });

  it('should ignore close requests when already closed', () => {
    const handler = vi.fn();

    component.closeRequested.subscribe(handler);
    component.requestClose('button');

    expect(handler).not.toHaveBeenCalled();
  });

  it('should project custom body and footer content', () => {
    const host = TestBed.createComponent(ModalTestHost);

    host.detectChanges();

    expect(
      host.nativeElement.querySelector(
        '.fx-modal-body .test-content',
      )?.textContent,
    ).toContain('Projected body');

    expect(
      host.nativeElement.querySelector(
        '.fx-modal-footer .test-footer',
      )?.textContent,
    ).toContain('Projected footer');
  });

  it('should close when the parent accepts a close request', () => {
    const host = TestBed.createComponent(ModalTestHost);

    host.detectChanges();

    const button: HTMLButtonElement =
      host.nativeElement.querySelector('.fx-modal-close');

    button.click();

    host.detectChanges();

    expect(host.componentInstance.open()).toBe(false);
    expect(host.componentInstance.reason()).toBe('button');

    const nativeDialog: HTMLDialogElement =
      host.nativeElement.querySelector('dialog');

    expect(nativeDialog.open).toBe(false);
  });
});