import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  let service: ToastService;

  beforeEach(() => {
    vi.useFakeTimers();

    TestBed.configureTestingModule({});
    service = TestBed.inject(ToastService);
  });

  afterEach(() => {
    service.clear();
    vi.useRealTimers();
  });

  it('should create the service', () => {
    expect(service).toBeTruthy();
  });

  it('should start with no notifications', () => {
    expect(service.notifications()).toEqual([]);
  });

  it('should create a success notification', () => {
    service.success('Saved', 'Booking saved');

    expect(service.notifications()[0]).toMatchObject({
      tone: 'success',
      title: 'Saved',
      message: 'Booking saved',
    });
  });

  it('should create an error notification', () => {
    service.error('Failed');
    expect(service.notifications()[0].tone).toBe('error');
  });

  it('should create a warning notification', () => {
    service.warning('Low stock');
    expect(service.notifications()[0].tone).toBe('warning');
  });

  it('should create an information notification', () => {
    service.info('New booking');
    expect(service.notifications()[0].tone).toBe('info');
  });

  it('should assign unique identifiers', () => {
    const a = service.success('First');
    const b = service.success('Second');

    expect(a).not.toBe(b);
  });

  it('should dismiss an individual notification', () => {
    const id = service.success('First');
    service.info('Second');

    service.dismiss(id);

    expect(service.notifications().length).toBe(1);
    expect(service.notifications()[0].title).toBe('Second');
  });

  it('should safely ignore unknown identifiers', () => {
    service.info('First');
    service.dismiss(99999);

    expect(service.notifications().length).toBe(1);
  });

  it('should clear all notifications', () => {
    service.success('First');
    service.error('Second');

    service.clear();

    expect(service.notifications()).toEqual([]);
  });

  it('should automatically dismiss success messages', () => {
    service.success('Saved');

    vi.advanceTimersByTime(4999);
    expect(service.notifications().length).toBe(1);

    vi.advanceTimersByTime(1);
    expect(service.notifications().length).toBe(0);
  });

  it('should automatically dismiss information messages', () => {
    service.info('Information');
    vi.advanceTimersByTime(5000);

    expect(service.notifications().length).toBe(0);
  });

  it('should preserve error messages by default', () => {
    service.error('Failed');
    vi.advanceTimersByTime(60000);

    expect(service.notifications().length).toBe(1);
  });

  it('should preserve warning messages by default', () => {
    service.warning('Warning');
    vi.advanceTimersByTime(60000);

    expect(service.notifications().length).toBe(1);
  });

  it('should support custom durations', () => {
    service.success('Saved', '', 2000);
    vi.advanceTimersByTime(2000);

    expect(service.notifications().length).toBe(0);
  });

  it('should support persistent notifications', () => {
    service.success('Saved', '', 0);
    vi.advanceTimersByTime(60000);

    expect(service.notifications().length).toBe(1);
  });

  it('should enforce minimum positive duration', () => {
    service.info('Info', '', 1);
    expect(service.notifications()[0].duration).toBe(1000);
  });

  it('should enforce maximum duration', () => {
    service.info('Info', '', 1000000);
    expect(service.notifications()[0].duration).toBe(60000);
  });

  it('should handle invalid duration values', () => {
    service.info('Info', '', Number.NaN);
    service.error('Error', '', -1);

    expect(service.notifications().map(item => item.duration))
      .toEqual([5000, 0]);
  });

  it('should limit the notification stack to five', () => {
    for (let index = 1; index <= 6; index++) {
      service.info(`Message ${index}`, '', 0);
    }

    expect(service.notifications().length).toBe(5);
    expect(service.notifications()[0].title).toBe('Message 2');
  });

  it('should cancel timers when notifications are cleared', () => {
    service.success('Saved');
    service.clear();

    expect(vi.getTimerCount()).toBe(0);
  });

  it('should cancel timers on manual dismissal', () => {
    const id = service.success('Saved');
    service.dismiss(id);

    expect(vi.getTimerCount()).toBe(0);
  });

  it('should pause automatic dismissal', () => {
    const id = service.success('Saved');
    vi.advanceTimersByTime(2000);

    service.pause(id);
    vi.advanceTimersByTime(10000);

    expect(service.notifications().length).toBe(1);
  });

  it('should resume with the remaining duration', () => {
    const id = service.success('Saved');

    vi.advanceTimersByTime(2000);
    service.pause(id);
    vi.advanceTimersByTime(10000);
    service.resume(id);

    vi.advanceTimersByTime(2999);
    expect(service.notifications().length).toBe(1);

    vi.advanceTimersByTime(1);
    expect(service.notifications().length).toBe(0);
  });

  it('should not start a timer for persistent messages', () => {
    const id = service.error('Failed');

    service.pause(id);
    service.resume(id);

    expect(vi.getTimerCount()).toBe(0);
  });

  it('should reject blank notification titles', () => {
    expect(() => service.info('   ')).toThrow();
    expect(service.notifications().length).toBe(0);
  });

  it('should trim the notification title', () => {
    service.info('  Saved  ');

    expect(service.notifications()[0].title).toBe('Saved');
  });

  it('should clean up a paused notification on dismissal', () => {
    const id = service.info('Saved');

    service.pause(id);
    service.dismiss(id);
    service.resume(id);

    expect(service.notifications().length).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});