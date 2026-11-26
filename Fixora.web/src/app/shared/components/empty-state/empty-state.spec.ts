import {
  ComponentFixture,
  TestBed,
} from '@angular/core/testing';

import { vi } from 'vitest';
import { EmptyState } from './empty-state';

describe('EmptyState', () => {
  let fixture: ComponentFixture<EmptyState>;
  let component: EmptyState;

  function query(selector: string): HTMLElement | null {
    return fixture.nativeElement.querySelector(selector);
  }

  function actionButton(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('button');
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EmptyState],
    }).compileComponents();

    fixture = TestBed.createComponent(EmptyState);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the empty state', () => {
    expect(component).toBeTruthy();
  });

  it('should render the default title', () => {
    expect(query('.fx-empty-title')?.textContent)
      .toContain('No records found');
  });

  it('should render the default description', () => {
    expect(query('.fx-empty-description')?.textContent)
      .toContain('There are no records to display.');
  });

  it('should support a custom title', () => {
    fixture.componentRef.setInput('title', 'No bookings found');
    fixture.detectChanges();

    expect(query('.fx-empty-title')?.textContent)
      .toContain('No bookings found');
  });

  it('should support a custom description', () => {
    fixture.componentRef.setInput('description', 'Add a booking');
    fixture.detectChanges();

    expect(query('.fx-empty-description')?.textContent)
      .toContain('Add a booking');
  });

  it('should omit an empty description', () => {
    fixture.componentRef.setInput('description', '');
    fixture.detectChanges();

    expect(query('.fx-empty-description')).toBeNull();
  });

  it('should render a decorative icon by default', () => {
    expect(query('.fx-empty-icon svg')).not.toBeNull();
  });

  it('should support hiding the icon', () => {
    fixture.componentRef.setInput('showIcon', false);
    fixture.detectChanges();

    expect(query('.fx-empty-icon')).toBeNull();
  });

  it('should hide the icon from assistive technology', () => {
    expect(query('.fx-empty-icon')?.getAttribute('aria-hidden'))
      .toBe('true');
  });

  it('should support four icon variants', () => {
    const renderedIcons = new Set<string>();

    for (const icon of ['inbox', 'search', 'calendar', 'file']) {
      fixture.componentRef.setInput('icon', icon);
      fixture.detectChanges();

      const svg = query('.fx-empty-icon svg');

      expect(svg).not.toBeNull();
      renderedIcons.add(svg!.innerHTML);
    }

    expect(renderedIcons.size).toBe(4);
  });

  it('should omit the action button by default', () => {
    expect(query('button')).toBeNull();
  });

  it('should render a configured action button', () => {
    fixture.componentRef.setInput('actionLabel', 'Create Booking');
    fixture.detectChanges();

    expect(actionButton().textContent)
      .toContain('Create Booking');
  });

  it('should ignore whitespace-only action labels', () => {
    fixture.componentRef.setInput('actionLabel', '   ');
    fixture.detectChanges();

    expect(query('button')).toBeNull();
  });

  it('should emit the action event when clicked', () => {
    fixture.componentRef.setInput('actionLabel', 'Refresh');
    fixture.detectChanges();

    const handler = vi.fn();

    component.actionRequested.subscribe(handler);
    actionButton().click();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should support disabling the action button', () => {
    fixture.componentRef.setInput('actionLabel', 'Refresh');
    fixture.componentRef.setInput('actionDisabled', true);
    fixture.detectChanges();

    expect(actionButton().disabled).toBe(true);
  });

  it('should prevent disabled action events', () => {
    fixture.componentRef.setInput('actionLabel', 'Refresh');
    fixture.componentRef.setInput('actionDisabled', true);

    const handler = vi.fn();

    component.actionRequested.subscribe(handler);
    component.handleAction();

    expect(handler).not.toHaveBeenCalled();
  });

  it('should prevent actions without a configured label', () => {
    const handler = vi.fn();

    component.actionRequested.subscribe(handler);
    component.handleAction();

    expect(handler).not.toHaveBeenCalled();
  });

  it('should support a custom action button variant', () => {
    fixture.componentRef.setInput('actionLabel', 'Refresh');
    fixture.componentRef.setInput('actionVariant', 'outline');
    fixture.detectChanges();

    expect(actionButton().classList.contains('fx-button--outline'))
      .toBe(true);
  });

  it('should support compact layout', () => {
    fixture.componentRef.setInput('compact', true);
    fixture.detectChanges();

    expect(query('.fx-empty-state--compact')).not.toBeNull();
  });

  it('should expose status semantics for the empty message', () => {
    expect(query('.fx-empty-copy')?.getAttribute('role'))
      .toBe('status');
  });

  it('should render empty state content as plain text', () => {
    fixture.componentRef.setInput('title', '<b>No records</b>');
    fixture.componentRef.setInput('description', '<i>Empty</i>');
    fixture.detectChanges();

    expect(query('.fx-empty-title')?.textContent)
      .toContain('<b>No records</b>');

    expect(query('.fx-empty-description')?.textContent)
      .toContain('<i>Empty</i>');

    expect(query('.fx-empty-title b')).toBeNull();
    expect(query('.fx-empty-description i')).toBeNull();
  });
});