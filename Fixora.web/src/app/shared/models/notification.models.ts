export type NotificationTone =
  | 'success'
  | 'error'
  | 'warning'
  | 'info';

export interface ToastOptions {
  readonly tone: NotificationTone;
  readonly title: string;
  readonly message?: string;
  readonly duration?: number;
}

export interface ToastNotification {
  readonly id: number;
  readonly tone: NotificationTone;
  readonly title: string;
  readonly message: string;
  readonly duration: number;
}