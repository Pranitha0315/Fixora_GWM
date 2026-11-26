import { Component } from '@angular/core';
import {
  ComponentFixture,
  TestBed,
} from '@angular/core/testing';

import { KpiCard } from './kpi-card';

@Component({
  standalone: true,
  imports: [KpiCard],
  template: `
    <fx-kpi-card
      label="Today's Bookings"
      [value]="24"
    >
      <span kpi-icon>BK</span>
    </fx-kpi-card>
  `,
})
class KpiCardTestHost {}

describe('KpiCard', () => {
  let fixture: ComponentFixture<KpiCard>;

  function element(selector: string): HTMLElement | null {
    return fixture.nativeElement.querySelector(selector);
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [KpiCard, KpiCardTestHost],
    }).compileComponents();

    fixture = TestBed.createComponent(KpiCard);

    fixture.componentRef.setInput(
      'label',
      "Today's Bookings",
    );

    fixture.componentRef.setInput('value', 24);

    fixture.detectChanges();
  });

  it('should create the KPI card', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render the KPI label', () => {
    expect(
      element('.fx-kpi-label')?.textContent,
    ).toContain("Today's Bookings");
  });

  it('should render a numeric value', () => {
    expect(
      element('.fx-kpi-value')?.textContent,
    ).toBe('24');
  });

  it('should render a formatted string value', () => {
    fixture.componentRef.setInput('value', 'Rs. 85,000');
    fixture.detectChanges();

    expect(
      element('.fx-kpi-value')?.textContent,
    ).toBe('Rs. 85,000');
  });

  it('should render a zero value', () => {
    fixture.componentRef.setInput('value', 0);
    fixture.detectChanges();

    expect(
      element('.fx-kpi-value')?.textContent,
    ).toBe('0');
  });

  it('should render the description', () => {
    fixture.componentRef.setInput(
      'description',
      'Ready for assignment',
    );

    fixture.detectChanges();

    expect(
      element('.fx-kpi-description')?.textContent,
    ).toContain('Ready for assignment');
  });

  it('should support all semantic tones', () => {
    const tones = [
      'primary',
      'success',
      'warning',
      'danger',
      'info',
    ];

    for (const tone of tones) {
      fixture.componentRef.setInput('tone', tone);
      fixture.detectChanges();

      expect(
        element(`.fx-kpi-tone--${tone}`),
      ).not.toBeNull();
    }
  });

  it('should render custom icon content', () => {
    const host = TestBed.createComponent(KpiCardTestHost);
    host.detectChanges();

    expect(
      host.nativeElement.querySelector('.fx-kpi-icon')
        ?.textContent,
    ).toContain('BK');
  });

  it('should hide the icon when requested', () => {
    fixture.componentRef.setInput('showIcon', false);
    fixture.detectChanges();

    expect(element('.fx-kpi-icon')).toBeNull();
  });

  it('should mark decorative icon as hidden from assistive technology', () => {
    expect(
      element('.fx-kpi-icon')?.getAttribute('aria-hidden'),
    ).toBe('true');
  });

  it('should hide the trend when no trend is provided', () => {
    expect(element('.fx-kpi-trend')).toBeNull();
  });

  it('should render an upward trend', () => {
    fixture.componentRef.setInput('trend', '+12%');
    fixture.componentRef.setInput('trendDirection', 'up');
    fixture.detectChanges();

    expect(
      element('.fx-kpi-trend')?.textContent,
    ).toContain('\u2191');

    expect(
      element('.fx-kpi-trend')?.textContent,
    ).toContain('+12%');
  });

  it('should render a downward trend', () => {
    fixture.componentRef.setInput('trend', '-8%');
    fixture.componentRef.setInput('trendDirection', 'down');
    fixture.detectChanges();

    expect(
      element('.fx-kpi-trend')?.textContent,
    ).toContain('\u2193');
  });

  it('should render a neutral trend', () => {
    fixture.componentRef.setInput('trend', 'No change');
    fixture.detectChanges();

    expect(
      element('.fx-kpi-trend')?.textContent,
    ).toContain('\u2014');
  });

  it('should configure trend colour independently', () => {
    fixture.componentRef.setInput('trend', '-10%');
    fixture.componentRef.setInput('trendDirection', 'down');
    fixture.componentRef.setInput('trendTone', 'success');
    fixture.detectChanges();

    expect(
      element('.fx-kpi-text--success'),
    ).not.toBeNull();
  });

  it('should display a loading skeleton', () => {
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();

    expect(element('.fx-kpi-skeleton')).not.toBeNull();
    expect(element('.fx-kpi-value')).toBeNull();
  });

  it('should indicate the busy state accessibly', () => {
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();

    expect(
      element('.fx-kpi-card')?.getAttribute('aria-busy'),
    ).toBe('true');

    expect(
      element('[role="status"]')?.textContent,
    ).toContain('Loading statistic...');
  });

  it('should restore the value when loading finishes', () => {
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();

    fixture.componentRef.setInput('loading', false);
    fixture.detectChanges();

    expect(element('.fx-kpi-skeleton')).toBeNull();

    expect(
      element('.fx-kpi-value')?.textContent,
    ).toBe('24');

    expect(
      element('.fx-kpi-card')?.hasAttribute('aria-busy'),
    ).toBe(false);
  });
});