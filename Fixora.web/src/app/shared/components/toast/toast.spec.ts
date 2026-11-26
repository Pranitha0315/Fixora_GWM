import {
  ComponentFixture,
  TestBed,
} from '@angular/core/testing';

import { vi } from 'vitest';
import { Toast } from './toast';
import { ToastService } from '../../services/toast.service';

describe('Toast', () => {
  let fixture: ComponentFixture<Toast>;
  let service: ToastService;

  function items(): NodeListOf<HTMLElement> {
    return fixture.nativeElement.querySelectorAll(
      '.fx-toast-item',
    );
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Toast],
    }).compileComponents();

    service = TestBed.inject(ToastService);
    fixture = TestBed.createComponent(Toast);
    fixture.detectChanges();
  });

  afterEach(() => {
    service.clear();
    vi.restoreAllMocks();
  });

  it('should create the toast container', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render no items initially', () => {
    expect(items().length).toBe(0);
  });

  it('should render a notification from the service', () => {
    service.success('Booking confirmed');
    fixture.detectChanges();

    expect(items().length).toBe(1);
    expect(items()[0].textContent).toContain('Booking confirmed');
  });

  it('should render multiple notifications', () => {
    service.success('Saved');
    service.error('Failed');
    service.warning('Low stock');

    fixture.detectChanges();

    expect(items().length).toBe(3);
  });

  it('should render the correct notification tone', () => {
    service.error('Failed');
    fixture.detectChanges();

    expect(
      items()[0].querySelector('.fx-alert--error'),
    ).not.toBeNull();
  });

  it('should render notification descriptions', () => {
    service.info('Booking', 'New customer request');
    fixture.detectChanges();

    expect(items()[0].textContent)
      .toContain('New customer request');
  });

  it('should support manual dismissal', () => {
    service.error('Failed');
    fixture.detectChanges();

    items()[0].querySelector('button')!.click();
    fixture.detectChanges();

    expect(items().length).toBe(0);
    expect(service.notifications().length).toBe(0);
  });

  it('should remove every notification when cleared', () => {
    service.info('First');
    service.warning('Second');
    fixture.detectChanges();

    service.clear();
    fixture.detectChanges();

    expect(items().length).toBe(0);
  });

  it('should display an accessible notifications region', () => {
    const region = fixture.nativeElement.querySelector(
      '.fx-toast-container',
    );

    expect(region.getAttribute('aria-label'))
      .toBe('Notifications');
  });

  it('should identify the notification in its dismiss label', () => {
    service.error('Payment failed');
    fixture.detectChanges();

    expect(
      items()[0].querySelector('button')?.getAttribute('aria-label'),
    ).toBe('Dismiss notification: Payment failed');
  });

  it('should pause dismissal on mouse enter', () => {
    const id = service.info('Information');
    fixture.detectChanges();

    const handler = vi.spyOn(service, 'pause');

    items()[0].dispatchEvent(new MouseEvent('mouseenter'));

    expect(handler).toHaveBeenCalledWith(id);
  });

  it('should resume dismissal on mouse leave without focus', () => {
    const id = service.info('Information');
    fixture.detectChanges();

    const handler = vi.spyOn(service, 'resume');

    items()[0].dispatchEvent(new MouseEvent('mouseleave'));

    expect(handler).toHaveBeenCalledWith(id);
  });

  it('should pause dismissal when keyboard focus enters', () => {
    const id = service.info('Information');
    fixture.detectChanges();

    const handler = vi.spyOn(service, 'pause');

    items()[0].querySelector('button')!.dispatchEvent(
      new FocusEvent('focusin', { bubbles: true }),
    );

    expect(handler).toHaveBeenCalledWith(id);
  });

  it('should respect the maximum stack size', () => {
    for (let index = 0; index < 8; index++) {
      service.info(`Message ${index}`);
    }

    fixture.detectChanges();

    expect(items().length).toBe(5);
  });
});