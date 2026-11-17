import {
  ComponentFixture,
  TestBed,
} from '@angular/core/testing';

import { vi } from 'vitest';
import { ErrorState } from './error-state';

describe('ErrorState', () => {
  let fixture: ComponentFixture<ErrorState>;
  let component: ErrorState;

  function query(selector: string): HTMLElement | null {
    return fixture.nativeElement.querySelector(selector);
  }

  function retryButton(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('button');
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ErrorState],
    }).compileComponents();

    fixture = TestBed.createComponent(ErrorState);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the error state', () => {
    expect(component).toBeTruthy();
  });

  it('should render the default title', () => {
    expect(query('.fx-error-title')?.textContent)
      .toContain('Something went wrong');
  });

  it('should render the default description', () => {
    expect(query('.fx-error-description')?.textContent)
      .toContain('Unable to load the requested information.');
  });

  it('should support a custom title', () => {
    fixture.componentRef.setInput('title', 'Unable to load bookings');
    fixture.detectChanges();

    expect(query('.fx-error-title')?.textContent)
      .toContain('Unable to load bookings');
  });

  it('should support a custom description', () => {
    fixture.componentRef.setInput('description', 'Please check your connection');
    fixture.detectChanges();

    expect(query('.fx-error-description')?.textContent)
      .toContain('Please check your connection');
  });

  it('should omit an empty description', () => {
    fixture.componentRef.setInput('description', '');
    fixture.detectChanges();

    expect(query('.fx-error-description')).toBeNull();
  });

  it('should render an error icon by default', () => {
    expect(query('.fx-error-icon svg')).not.toBeNull();
  });

  it('should support hiding the error icon', () => {
    fixture.componentRef.setInput('showIcon', false);
    fixture.detectChanges();

    expect(query('.fx-error-icon')).toBeNull();
  });

  it('should hide decorative icons from assistive technology', () => {
    expect(query('.fx-error-icon')?.getAttribute('aria-hidden'))
      .toBe('true');
  });

  it('should render the retry button by default', () => {
    expect(retryButton().textContent).toContain('Try Again');
  });

  it('should support hiding the retry button', () => {
    fixture.componentRef.setInput('showRetry', false);
    fixture.detectChanges();

    expect(query('button')).toBeNull();
  });

  it('should support a custom retry label', () => {
    fixture.componentRef.setInput('retryLabel', 'Reload Bookings');
    fixture.detectChanges();

    expect(retryButton().textContent).toContain('Reload Bookings');
  });

  it('should omit whitespace-only retry labels', () => {
    fixture.componentRef.setInput('retryLabel', '   ');
    fixture.detectChanges();

    expect(query('button')).toBeNull();
  });

  it('should emit the retry event when clicked', () => {
    const handler = vi.fn();

    component.retryRequested.subscribe(handler);
    retryButton().click();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should support disabling retries', () => {
    fixture.componentRef.setInput('retryDisabled', true);
    fixture.detectChanges();

    expect(retryButton().disabled).toBe(true);
  });

  it('should prevent disabled retry events', () => {
    fixture.componentRef.setInput('retryDisabled', true);

    const handler = vi.fn();

    component.retryRequested.subscribe(handler);
    component.handleRetry();

    expect(handler).not.toHaveBeenCalled();
  });

  it('should prevent retry events when the action is hidden', () => {
    fixture.componentRef.setInput('showRetry', false);

    const handler = vi.fn();

    component.retryRequested.subscribe(handler);
    component.handleRetry();

    expect(handler).not.toHaveBeenCalled();
  });

  it('should prevent retries without a valid label', () => {
    fixture.componentRef.setInput('retryLabel', ' ');

    const handler = vi.fn();

    component.retryRequested.subscribe(handler);
    component.handleRetry();

    expect(handler).not.toHaveBeenCalled();
  });

  it('should disable retry controls while retrying', () => {
    fixture.componentRef.setInput('retrying', true);
    fixture.detectChanges();

    expect(retryButton().disabled).toBe(true);
  });

  it('should prevent repeat retry events while retrying', () => {
    fixture.componentRef.setInput('retrying', true);

    const handler = vi.fn();

    component.retryRequested.subscribe(handler);
    component.handleRetry();

    expect(handler).not.toHaveBeenCalled();
  });

  it('should render the retry processing label', () => {
    fixture.componentRef.setInput('retrying', true);
    fixture.componentRef.setInput('retryLoadingText', 'Reconnecting...');
    fixture.detectChanges();

    expect(retryButton().textContent).toContain('Reconnecting...');
  });

  it('should support compact layout', () => {
    fixture.componentRef.setInput('compact', true);
    fixture.detectChanges();

    expect(query('.fx-error-state--compact')).not.toBeNull();
  });

  it('should announce errors by default', () => {
    expect(query('.fx-error-copy')?.getAttribute('role'))
      .toBe('alert');
  });

  it('should allow automatic error announcements to be disabled', () => {
    fixture.componentRef.setInput('announceError', false);
    fixture.detectChanges();

    expect(query('.fx-error-copy')?.hasAttribute('role'))
      .toBe(false);
  });

  it('should render error messages as plain text', () => {
    fixture.componentRef.setInput('title', '<b>Error</b>');
    fixture.componentRef.setInput('description', '<i>Retry</i>');
    fixture.detectChanges();

    expect(query('.fx-error-title')?.textContent)
      .toContain('<b>Error</b>');

    expect(query('.fx-error-description')?.textContent)
      .toContain('<i>Retry</i>');

    expect(query('.fx-error-title b')).toBeNull();
    expect(query('.fx-error-description i')).toBeNull();
  });
});