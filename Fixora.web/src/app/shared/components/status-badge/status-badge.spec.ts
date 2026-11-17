import { Component, signal } from '@angular/core';

import {
  ComponentFixture,
  TestBed,
} from '@angular/core/testing';

import { StatusBadge } from './status-badge';

import type {
  StatusBadgeTone,
} from './status-badge';

@Component({
  standalone: true,
  imports: [StatusBadge],
  template: `
    <fx-status-badge
      [label]="label()"
      [tone]="tone()"
    />
  `,
})
class StatusBadgeTestHost {
  readonly label = signal('Pending');

  readonly tone =
    signal<StatusBadgeTone>('warning');
}

describe('StatusBadge', () => {
  let fixture: ComponentFixture<StatusBadge>;

  function badge(): HTMLElement {
    return fixture.nativeElement.querySelector(
      '.fx-status-badge',
    );
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        StatusBadge,
        StatusBadgeTestHost,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StatusBadge);

    fixture.componentRef.setInput(
      'label',
      'Pending',
    );

    fixture.detectChanges();
  });

  it('should create the status badge', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render the status label', () => {
    expect(badge().textContent).toContain('Pending');
  });

  it('should use neutral tone by default', () => {
    expect(
      badge().classList.contains(
        'fx-status-badge--neutral',
      ),
    ).toBe(true);
  });

  it('should use medium size by default', () => {
    expect(
      badge().classList.contains(
        'fx-status-badge--md',
      ),
    ).toBe(true);
  });

  it('should use filled appearance by default', () => {
    expect(
      badge().classList.contains(
        'fx-status-badge--filled',
      ),
    ).toBe(true);
  });

  it('should support all semantic colour variants', () => {
    const tones = [
      'primary',
      'success',
      'warning',
      'danger',
      'info',
      'neutral',
    ] as const;

    for (const tone of tones) {
      fixture.componentRef.setInput('tone', tone);
      fixture.detectChanges();

      expect(
        badge().classList.contains(
          `fx-status-badge--${tone}`,
        ),
      ).toBe(true);
    }
  });

  it('should support all badge sizes', () => {
    const sizes = ['sm', 'md', 'lg'] as const;

    for (const size of sizes) {
      fixture.componentRef.setInput('size', size);
      fixture.detectChanges();

      expect(
        badge().classList.contains(
          `fx-status-badge--${size}`,
        ),
      ).toBe(true);
    }
  });

  it('should support outline appearance', () => {
    fixture.componentRef.setInput(
      'appearance',
      'outline',
    );

    fixture.detectChanges();

    expect(
      badge().classList.contains(
        'fx-status-badge--outline',
      ),
    ).toBe(true);

    expect(
      badge().classList.contains(
        'fx-status-badge--filled',
      ),
    ).toBe(false);
  });

  it('should render the status dot by default', () => {
    expect(
      badge().querySelector(
        '.fx-status-badge-dot',
      ),
    ).not.toBeNull();
  });

  it('should hide the status dot when requested', () => {
    fixture.componentRef.setInput('showDot', false);
    fixture.detectChanges();

    expect(
      badge().querySelector(
        '.fx-status-badge-dot',
      ),
    ).toBeNull();
  });

  it('should hide the decorative dot from assistive technology', () => {
    expect(
      badge()
        .querySelector('.fx-status-badge-dot')
        ?.getAttribute('aria-hidden'),
    ).toBe('true');
  });

  it('should update the status label dynamically', () => {
    fixture.componentRef.setInput(
      'label',
      'Confirmed',
    );

    fixture.detectChanges();

    expect(badge().textContent)
      .toContain('Confirmed');

    expect(badge().textContent)
      .not.toContain('Pending');
  });

  it('should remove the previous semantic tone', () => {
    fixture.componentRef.setInput('tone', 'warning');
    fixture.detectChanges();

    fixture.componentRef.setInput('tone', 'success');
    fixture.detectChanges();

    expect(
      badge().classList.contains(
        'fx-status-badge--success',
      ),
    ).toBe(true);

    expect(
      badge().classList.contains(
        'fx-status-badge--warning',
      ),
    ).toBe(false);
  });

  it('should not announce static statuses by default', () => {
    expect(badge().hasAttribute('role')).toBe(false);
  });

  it('should support accessible live status announcements', () => {
    fixture.componentRef.setInput(
      'announceChanges',
      true,
    );

    fixture.detectChanges();

    expect(
      badge().getAttribute('role'),
    ).toBe('status');
  });

  it('should remove live announcement role when disabled', () => {
    fixture.componentRef.setInput(
      'announceChanges',
      true,
    );

    fixture.detectChanges();

    fixture.componentRef.setInput(
      'announceChanges',
      false,
    );

    fixture.detectChanges();

    expect(
      badge().hasAttribute('role'),
    ).toBe(false);
  });

  it('should support a custom accessible label', () => {
    fixture.componentRef.setInput(
      'accessibleLabel',
      'Booking status: Pending',
    );

    fixture.detectChanges();

    expect(
      badge().getAttribute('aria-label'),
    ).toBe('Booking status: Pending');

    expect(
      badge().getAttribute('role'),
    ).toBe('group');
  });

  it('should update from parent signal inputs', () => {
    const host =
      TestBed.createComponent(StatusBadgeTestHost);

    host.detectChanges();

    host.componentInstance.label.set('Approved');
    host.componentInstance.tone.set('success');

    host.detectChanges();

    const rendered: HTMLElement =
      host.nativeElement.querySelector(
        '.fx-status-badge',
      );

    expect(rendered.textContent)
      .toContain('Approved');

    expect(
      rendered.classList.contains(
        'fx-status-badge--success',
      ),
    ).toBe(true);
  });

  it('should render status labels as plain text', () => {
    fixture.componentRef.setInput(
      'label',
      '<b>Confirmed</b>',
    );

    fixture.detectChanges();

    expect(badge().textContent)
      .toContain('<b>Confirmed</b>');

    expect(badge().querySelector('b')).toBeNull();
  });

  it('should not create an interactive control', () => {
    expect(
      badge().querySelector('button, a, input'),
    ).toBeNull();

    expect(
      badge().hasAttribute('tabindex'),
    ).toBe(false);
  });
});