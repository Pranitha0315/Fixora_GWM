import {
  DestroyRef,
  Injectable,
  inject,
  signal,
} from '@angular/core';

import type {
  NotificationTone,
  ToastNotification,
  ToastOptions,
} from '../models/notification.models';

@Injectable({
  providedIn: 'root',
})
export class ToastService {
  private readonly state =
    signal<readonly ToastNotification[]>([]);

  readonly notifications = this.state.asReadonly();

  private readonly timers =
    new Map<number, ReturnType<typeof setTimeout>>();

  private readonly remaining = new Map<number, number>();
  private readonly deadlines = new Map<number, number>();

  private nextId = 0;
  private readonly maxNotifications = 5;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.clear());
  }

  show(options: ToastOptions): number {
    const title = options.title.trim();

    if (!title) {
      throw new Error('Notification title is required.');
    }

    const item: ToastNotification = {
      id: ++this.nextId,
      tone: options.tone,
      title,
      message: options.message ?? '',
      duration: this.normalizeDuration(
        options.tone,
        options.duration,
      ),
    };

    this.state.update(items => [...items, item]);

    while (this.state().length > this.maxNotifications) {
      this.dismiss(this.state()[0].id);
    }

    if (item.duration > 0) {
      this.schedule(item.id, item.duration);
    }

    return item.id;
  }

  success(title: string, message = '', duration?: number): number {
    return this.show({
      tone: 'success', title, message, duration,
    });
  }

  error(title: string, message = '', duration?: number): number {
    return this.show({
      tone: 'error', title, message, duration,
    });
  }

  warning(title: string, message = '', duration?: number): number {
    return this.show({
      tone: 'warning', title, message, duration,
    });
  }

  info(title: string, message = '', duration?: number): number {
    return this.show({
      tone: 'info', title, message, duration,
    });
  }

  dismiss(id: number): void {
    this.cancelTimer(id);
    this.remaining.delete(id);
    this.state.update(items =>
      items.filter(item => item.id !== id),
    );
  }

  clear(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }

    this.timers.clear();
    this.deadlines.clear();
    this.remaining.clear();
    this.state.set([]);
  }

  pause(id: number): void {
    const deadline = this.deadlines.get(id);

    if (deadline === undefined) {
      return;
    }

    this.remaining.set(
      id,
      Math.max(0, deadline - Date.now()),
    );

    this.cancelTimer(id);
  }

  resume(id: number): void {
    const duration = this.remaining.get(id);

    if (duration === undefined) {
      return;
    }

    this.remaining.delete(id);

    if (!this.state().some(item => item.id === id)) {
      return;
    }

    if (duration <= 0) {
      this.dismiss(id);
      return;
    }

    this.schedule(id, duration);
  }

  private normalizeDuration(
    tone: NotificationTone,
    duration?: number,
  ): number {
    const defaultDuration =
      tone === 'error' || tone === 'warning'
        ? 0
        : 5000;

    if (
      duration === undefined ||
      !Number.isFinite(duration) ||
      duration < 0
    ) {
      return defaultDuration;
    }

    if (duration === 0) {
      return 0;
    }

    return Math.max(
      1000,
      Math.min(60000, Math.floor(duration)),
    );
  }

  private schedule(id: number, duration: number): void {
    this.cancelTimer(id);

    this.deadlines.set(id, Date.now() + duration);

    this.timers.set(
      id,
      setTimeout(() => this.dismiss(id), duration),
    );
  }

  private cancelTimer(id: number): void {
    const timer = this.timers.get(id);

    if (timer !== undefined) {
      clearTimeout(timer);
    }

    this.timers.delete(id);
    this.deadlines.delete(id);
  }
}