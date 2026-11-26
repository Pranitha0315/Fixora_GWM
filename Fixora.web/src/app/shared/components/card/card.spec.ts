import { Component } from '@angular/core';
import {
  ComponentFixture,
  TestBed,
} from '@angular/core/testing';

import { Card } from './card';

@Component({
  standalone: true,
  imports: [Card],
  template: `
    <fx-card
      title="Workshop Activity"
      [showFooter]="true"
    >
      <button card-actions>View All</button>

      <p>Recent job cards</p>

      <span card-footer>Updated today</span>
    </fx-card>
  `,
})
class CardTestHost {}

describe('Card', () => {
  let fixture: ComponentFixture<Card>;

  function element(selector: string): HTMLElement | null {
    return fixture.nativeElement.querySelector(selector);
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Card, CardTestHost],
    }).compileComponents();

    fixture = TestBed.createComponent(Card);
    fixture.detectChanges();
  });

  it('should create the card', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should use medium padding by default', () => {
    expect(
      element('.fx-card--padding-md'),
    ).not.toBeNull();
  });

  it('should use small elevation by default', () => {
    expect(
      element('.fx-card--elevation-sm'),
    ).not.toBeNull();
  });

  it('should render a border by default', () => {
    expect(
      element('.fx-card--bordered'),
    ).not.toBeNull();
  });

  it('should render a card title', () => {
    fixture.componentRef.setInput('title', 'Bookings');
    fixture.detectChanges();

    expect(
      element('.fx-card-title')?.textContent,
    ).toContain('Bookings');
  });

  it('should render a card subtitle', () => {
    fixture.componentRef.setInput(
      'subtitle',
      'Manage workshop bookings',
    );

    fixture.detectChanges();

    expect(
      element('.fx-card-subtitle')?.textContent,
    ).toContain('Manage workshop bookings');
  });

  it('should hide the header when requested', () => {
    fixture.componentRef.setInput('showHeader', false);
    fixture.detectChanges();

    expect(element('.fx-card-header')).toBeNull();
    expect(element('.fx-card-body')).not.toBeNull();
  });

  it('should hide the footer by default', () => {
    expect(element('.fx-card-footer')).toBeNull();
  });

  it('should render the footer when requested', () => {
    fixture.componentRef.setInput('showFooter', true);
    fixture.detectChanges();

    expect(element('.fx-card-footer')).not.toBeNull();
  });

  it('should support all padding options', () => {
    for (const padding of ['none', 'sm', 'md', 'lg']) {
      fixture.componentRef.setInput('padding', padding);
      fixture.detectChanges();

      expect(
        element(`.fx-card--padding-${padding}`),
      ).not.toBeNull();
    }
  });

  it('should support all elevation options', () => {
    for (const elevation of ['none', 'sm', 'md']) {
      fixture.componentRef.setInput('elevation', elevation);
      fixture.detectChanges();

      expect(
        element(`.fx-card--elevation-${elevation}`),
      ).not.toBeNull();
    }
  });

  it('should support borderless cards', () => {
    fixture.componentRef.setInput('bordered', false);
    fixture.detectChanges();

    expect(element('.fx-card--bordered')).toBeNull();
  });

  it('should render projected body content', () => {
    const host = TestBed.createComponent(CardTestHost);
    host.detectChanges();

    expect(
      host.nativeElement.querySelector('.fx-card-body')
        ?.textContent,
    ).toContain('Recent job cards');
  });

  it('should render projected header actions', () => {
    const host = TestBed.createComponent(CardTestHost);
    host.detectChanges();

    expect(
      host.nativeElement.querySelector('.fx-card-actions')
        ?.textContent,
    ).toContain('View All');
  });

  it('should render projected footer content', () => {
    const host = TestBed.createComponent(CardTestHost);
    host.detectChanges();

    expect(
      host.nativeElement.querySelector('.fx-card-footer')
        ?.textContent,
    ).toContain('Updated today');
  });
});