import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { ToastService } from './shared/services/toast.service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render the router outlet', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('router-outlet')).toBeTruthy();
  });
});

describe('App global toast integration', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.inject(ToastService).clear();
  });

  it('should mount the global toast container', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('fx-toast')).not.toBeNull();
  });

  it('should mount exactly one global toast container', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelectorAll('fx-toast').length).toBe(1);
  });

  it('should preserve the application router outlet', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('router-outlet')).not.toBeNull();
    expect(element.querySelector('fx-toast')).not.toBeNull();
  });

  it('should render a global success notification', () => {
    const fixture = TestBed.createComponent(App);
    const service = TestBed.inject(ToastService);

    fixture.detectChanges();

    service.success('Booking confirmed', 'Booking saved', 0);

    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;

    expect(
      element.querySelector('.fx-toast-item')?.textContent,
    ).toContain('Booking confirmed');
  });

  it('should render a global error notification', () => {
    const fixture = TestBed.createComponent(App);
    const service = TestBed.inject(ToastService);

    fixture.detectChanges();

    service.error('Payment failed', 'Please try again');

    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;

    expect(
      element.querySelector('.fx-alert--error')?.textContent,
    ).toContain('Payment failed');
  });

  it('should display multiple global notifications', () => {
    const fixture = TestBed.createComponent(App);
    const service = TestBed.inject(ToastService);

    fixture.detectChanges();

    service.success('Saved', '', 0);
    service.warning('Low stock');
    service.error('Unable to load');

    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;

    expect(
      element.querySelectorAll('.fx-toast-item').length,
    ).toBe(3);
  });

  it('should dismiss a global notification using its close button', () => {
    const fixture = TestBed.createComponent(App);
    const service = TestBed.inject(ToastService);

    fixture.detectChanges();

    service.error('Payment failed');

    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;

    const button = element.querySelector<HTMLButtonElement>(
      '.fx-toast-item button',
    );

    expect(button).not.toBeNull();

    button!.click();

    fixture.detectChanges();

    expect(service.notifications().length).toBe(0);
    expect(element.querySelector('.fx-toast-item')).toBeNull();
  });

  it('should remove all global notifications when cleared', () => {
    const fixture = TestBed.createComponent(App);
    const service = TestBed.inject(ToastService);

    fixture.detectChanges();

    service.info('New booking', '', 0);
    service.warning('Low stock');

    fixture.detectChanges();

    service.clear();

    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelectorAll('.fx-toast-item').length)
      .toBe(0);
  });
});
