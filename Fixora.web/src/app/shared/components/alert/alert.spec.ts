import {
  ComponentFixture,
  TestBed,
} from '@angular/core/testing';

import { vi } from 'vitest';
import { Alert } from './alert';

describe('Alert', () => {
  let fixture: ComponentFixture<Alert>;

  function query(selector: string): HTMLElement | null {
    return fixture.nativeElement.querySelector(selector);
  }

  function setInput(name: string, value: unknown): void {
    fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Alert],
    }).compileComponents();

    fixture = TestBed.createComponent(Alert);
    fixture.componentRef.setInput('title', 'Booking confirmed');
    fixture.detectChanges();
  });

  it('should create the alert', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should display the title', () => {
    expect(query('.fx-alert-title')?.textContent)
      .toContain('Booking confirmed');
  });

  it('should default to information tone', () => {
    expect(query('.fx-alert--info')).not.toBeNull();
  });

  it('should support every notification tone', () => {
    for (const tone of ['success', 'error', 'warning', 'info']) {
      setInput('tone', tone);
      expect(query(`.fx-alert--${tone}`)).not.toBeNull();
    }
  });

  it('should display a custom message', () => {
    setInput('message', 'Booking saved');
    expect(query('.fx-alert-message')?.textContent)
      .toContain('Booking saved');
  });

  it('should omit an empty message', () => {
    expect(query('.fx-alert-message')).toBeNull();
  });

  it('should show an icon by default', () => {
    expect(query('.fx-alert-icon svg')).not.toBeNull();
  });

  it('should support hiding the icon', () => {
    setInput('showIcon', false);
    expect(query('.fx-alert-icon')).toBeNull();
  });

  it('should hide the icon from assistive technology', () => {
    expect(query('.fx-alert-icon')?.getAttribute('aria-hidden'))
      .toBe('true');
  });

  it('should omit dismiss controls by default', () => {
    expect(query('button')).toBeNull();
  });

  it('should show a dismiss control when enabled', () => {
    setInput('dismissible', true);
    expect(query('button')).not.toBeNull();
  });

  it('should emit a dismissal event', () => {
    setInput('dismissible', true);

    const handler = vi.fn();
    fixture.componentInstance.dismissed.subscribe(handler);

    query('button')!.click();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should block dismissal when not dismissible', () => {
    const handler = vi.fn();
    fixture.componentInstance.dismissed.subscribe(handler);
    fixture.componentInstance.dismiss();

    expect(handler).not.toHaveBeenCalled();
  });

  it('should support a custom dismiss label', () => {
    setInput('dismissible', true);
    setInput('dismissLabel', 'Close booking alert');

    expect(query('button')?.getAttribute('aria-label'))
      .toBe('Close booking alert');
  });

  it('should use status semantics for normal messages', () => {
    expect(query('.fx-alert-copy')?.getAttribute('role'))
      .toBe('status');
  });

  it('should use alert semantics for errors', () => {
    setInput('tone', 'error');

    expect(query('.fx-alert-copy')?.getAttribute('role'))
      .toBe('alert');
  });

  it('should allow announcements to be disabled', () => {
    setInput('announce', false);
    expect(query('.fx-alert-copy')?.hasAttribute('role'))
      .toBe(false);
  });

  it('should render supplied messages as plain text', () => {
    setInput('title', '<b>Alert</b>');
    setInput('message', '<i>Message</i>');

    expect(query('.fx-alert-title')?.textContent)
      .toContain('<b>Alert</b>');

    expect(query('.fx-alert-message')?.textContent)
      .toContain('<i>Message</i>');

    expect(query('.fx-alert-title b')).toBeNull();
    expect(query('.fx-alert-message i')).toBeNull();
  });
});