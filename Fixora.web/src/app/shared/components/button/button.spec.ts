import { Component } from '@angular/core';
import {
  ComponentFixture,
  TestBed,
} from '@angular/core/testing';
import { vi } from 'vitest';

import { Button } from './button';

@Component({
  standalone: true,
  imports: [Button],
  template: `
    <fx-button>Save Changes</fx-button>
  `,
})
class ButtonTestHost {}

describe('Button', () => {
  let fixture: ComponentFixture<Button>;
  let component: Button;

  function nativeButton(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('button');
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Button, ButtonTestHost],
    }).compileComponents();

    fixture = TestBed.createComponent(Button);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the button', () => {
    expect(component).toBeTruthy();
  });

  it('should use primary variant by default', () => {
    expect(
      nativeButton().classList.contains('fx-button--primary'),
    ).toBe(true);
  });

  it('should use medium size by default', () => {
    expect(
      nativeButton().classList.contains('fx-button--md'),
    ).toBe(true);
  });

  it('should use native button type by default', () => {
    expect(nativeButton().type).toBe('button');
  });

  it('should support all button variants', () => {
    const variants = [
      'primary',
      'secondary',
      'outline',
      'danger',
      'ghost',
    ] as const;

    for (const variant of variants) {
      fixture.componentRef.setInput('variant', variant);
      fixture.detectChanges();

      expect(
        nativeButton().classList.contains(
          `fx-button--${variant}`,
        ),
      ).toBe(true);
    }
  });

  it('should support all button sizes', () => {
    const sizes = ['sm', 'md', 'lg'] as const;

    for (const size of sizes) {
      fixture.componentRef.setInput('size', size);
      fixture.detectChanges();

      expect(
        nativeButton().classList.contains(
          `fx-button--${size}`,
        ),
      ).toBe(true);
    }
  });

  it('should support submit button type', () => {
    fixture.componentRef.setInput('type', 'submit');
    fixture.detectChanges();

    expect(nativeButton().type).toBe('submit');
  });

  it('should disable the native button', () => {
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();

    expect(nativeButton().disabled).toBe(true);
  });

  it('should emit pressed when clicked', () => {
    const listener = vi.fn();

    component.pressed.subscribe(listener);
    nativeButton().click();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('should not emit when disabled', () => {
    const listener = vi.fn();

    component.pressed.subscribe(listener);

    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();

    nativeButton().click();

    expect(listener).not.toHaveBeenCalled();
  });

  it('should disable the button while loading', () => {
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();

    expect(nativeButton().disabled).toBe(true);
    expect(
      nativeButton().getAttribute('aria-busy'),
    ).toBe('true');
  });

  it('should render a loading spinner', () => {
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();

    expect(
      nativeButton().querySelector('.fx-button-spinner'),
    ).not.toBeNull();
  });

  it('should support custom loading text', () => {
    fixture.componentRef.setInput('loading', true);
    fixture.componentRef.setInput('loadingText', 'Saving...');
    fixture.detectChanges();

    expect(nativeButton().textContent).toContain('Saving...');
  });

  it('should not emit while loading', () => {
    const listener = vi.fn();

    component.pressed.subscribe(listener);

    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();

    nativeButton().click();

    expect(listener).not.toHaveBeenCalled();
  });

  it('should enable the button when loading finishes', () => {
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();

    fixture.componentRef.setInput('loading', false);
    fixture.detectChanges();

    expect(nativeButton().disabled).toBe(false);
    expect(
      nativeButton().hasAttribute('aria-busy'),
    ).toBe(false);
  });

  it('should remain disabled after loading if disabled', () => {
    fixture.componentRef.setInput('disabled', true);
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();

    fixture.componentRef.setInput('loading', false);
    fixture.detectChanges();

    expect(nativeButton().disabled).toBe(true);
  });

  it('should support full-width layout', () => {
    fixture.componentRef.setInput('fullWidth', true);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.classList.contains('fx-button-full'),
    ).toBe(true);
  });

  it('should support an accessible label', () => {
    fixture.componentRef.setInput(
      'accessibleLabel',
      'Save workshop settings',
    );

    fixture.detectChanges();

    expect(
      nativeButton().getAttribute('aria-label'),
    ).toBe('Save workshop settings');
  });

  it('should prevent manually dispatched clicks while disabled', () => {
    const listener = vi.fn();
    component.pressed.subscribe(listener);

    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();

    const event = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    });

    nativeButton().dispatchEvent(event);

    expect(listener).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it('should render projected button content', () => {
    const host = TestBed.createComponent(ButtonTestHost);
    host.detectChanges();

    const button: HTMLButtonElement =
      host.nativeElement.querySelector('button');

    expect(button.textContent).toContain('Save Changes');
  });
});