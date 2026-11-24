import {
  ComponentFixture,
  TestBed,
} from '@angular/core/testing';

import { LoadingState } from './loading-state';

describe('LoadingState', () => {
  let fixture: ComponentFixture<LoadingState>;
  let component: LoadingState;

  function query(selector: string): HTMLElement | null {
    return fixture.nativeElement.querySelector(selector);
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoadingState],
    }).compileComponents();

    fixture = TestBed.createComponent(LoadingState);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the loading state', () => {
    expect(component).toBeTruthy();
  });

  it('should render a spinner by default', () => {
    expect(query('.fx-loading-spinner')).not.toBeNull();
  });

  it('should use the medium spinner by default', () => {
    expect(query('.fx-loading-spinner--md')).not.toBeNull();
  });

  it('should render the default loading message', () => {
    expect(query('.fx-loading-message')?.textContent)
      .toContain('Loading...');
  });

  it('should support a custom loading message', () => {
    fixture.componentRef.setInput('message', 'Loading jobs...');
    fixture.detectChanges();

    expect(query('.fx-loading-message')?.textContent)
      .toContain('Loading jobs...');
  });

  it('should support a custom description', () => {
    fixture.componentRef.setInput('description', 'Please wait');
    fixture.detectChanges();

    expect(query('.fx-loading-description')?.textContent)
      .toContain('Please wait');
  });

  it('should omit the empty description', () => {
    expect(query('.fx-loading-description')).toBeNull();
  });

  it('should support all spinner sizes', () => {
    for (const size of ['sm', 'md', 'lg']) {
      fixture.componentRef.setInput('size', size);
      fixture.detectChanges();

      expect(query(`.fx-loading-spinner--${size}`))
        .not.toBeNull();
    }
  });

  it('should support skeleton loading', () => {
    fixture.componentRef.setInput('variant', 'skeleton');
    fixture.detectChanges();

    expect(query('.fx-loading-skeleton')).not.toBeNull();
    expect(query('.fx-loading-spinner')).toBeNull();
  });

  it('should render four skeleton rows by default', () => {
    fixture.componentRef.setInput('variant', 'skeleton');
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelectorAll('.fx-skeleton-row').length,
    ).toBe(4);
  });

  it('should support configurable skeleton rows', () => {
    fixture.componentRef.setInput('variant', 'skeleton');
    fixture.componentRef.setInput('skeletonRows', 6);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelectorAll('.fx-skeleton-row').length,
    ).toBe(6);
  });

  it('should enforce a minimum of one skeleton row', () => {
    fixture.componentRef.setInput('skeletonRows', -5);

    expect(component.rows().length).toBe(1);
  });

  it('should enforce a maximum of twenty skeleton rows', () => {
    fixture.componentRef.setInput('skeletonRows', 500);

    expect(component.rows().length).toBe(20);
  });

  it('should handle fractional skeleton row counts', () => {
    fixture.componentRef.setInput('skeletonRows', 3.8);

    expect(component.rows().length).toBe(3);
  });

  it('should handle non-finite skeleton row counts', () => {
    fixture.componentRef.setInput('skeletonRows', Number.NaN);

    expect(component.rows().length).toBe(4);
  });

  it('should expose accessible loading semantics', () => {
    expect(query('.fx-loading-state')?.getAttribute('role'))
      .toBe('status');

    expect(query('.fx-loading-state')?.getAttribute('aria-live'))
      .toBe('polite');
  });

  it('should hide the decorative spinner from assistive technology', () => {
    expect(query('.fx-loading-spinner')?.getAttribute('aria-hidden'))
      .toBe('true');
  });

  it('should hide decorative skeletons from assistive technology', () => {
    fixture.componentRef.setInput('variant', 'skeleton');
    fixture.detectChanges();

    expect(query('.fx-loading-skeleton')?.getAttribute('aria-hidden'))
      .toBe('true');
  });

  it('should support compact layout', () => {
    fixture.componentRef.setInput('compact', true);
    fixture.detectChanges();

    expect(query('.fx-loading-state--compact')).not.toBeNull();
  });

  it('should render loading messages as plain text', () => {
    fixture.componentRef.setInput('message', '<b>Loading</b>');
    fixture.detectChanges();

    expect(query('.fx-loading-message')?.textContent)
      .toContain('<b>Loading</b>');

    expect(query('.fx-loading-message b')).toBeNull();
  });
});