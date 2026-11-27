import {
  computed,
  effect,
  inject,
  Injectable,
  signal,
  untracked,
} from '@angular/core';

import type {
  EffectRef,
  OnDestroy,
  Signal,
} from '@angular/core';

import { Subscription } from 'rxjs';

import { SessionService } from '../../../core/auth/session.service';
import type { AuthSession } from '../../../core/models/auth-session.model';

import { AdaptiveQueueRealtimeService } from './adaptive-queue-realtime.service';
import type {
  AdaptiveQueueInvalidation,
  AdaptiveQueueRealtimeConnected,
} from './adaptive-queue-realtime.service';

import { AdaptiveQueueStateService } from './adaptive-queue-state.service';

/**
 * Length of the fixed coalescing window. The first invalidation
 * after an idle period opens the window; every further invalidation
 * inside it is merged and does NOT extend it. Sustained events
 * therefore cause one reconciliation request per window at most,
 * and reconciliation can never be postponed indefinitely.
 */
export const ADAPTIVE_QUEUE_RECONCILE_WINDOW_MS = 400;

export type AdaptiveQueueConnectionState =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'unavailable';

/** Truthful, presentation-ready realtime connection status. */
export interface AdaptiveQueueConnectionView {
  readonly state: AdaptiveQueueConnectionState;
  readonly label: string;
  readonly description: string;
}

const CONNECTION_VIEWS: Readonly<
  Record<AdaptiveQueueConnectionState, AdaptiveQueueConnectionView>
> = {
  connecting: {
    state: 'connecting',
    label: 'Connecting to live updates...',
    description: 'The board can still be refreshed manually.',
  },
  connected: {
    state: 'connected',
    label: 'Live updates connected',
    description:
      'Changes trigger a reload of this board. A connection does not '
      + 'guarantee that the board is complete or current.',
  },
  reconnecting: {
    state: 'reconnecting',
    label: 'Reconnecting to live updates...',
    description:
      'Changes may be missed meanwhile. The board can still be '
      + 'refreshed manually.',
  },
  unavailable: {
    state: 'unavailable',
    label: 'Live updates unavailable',
    description: 'Use Refresh to reload the board manually.',
  },
};

/**
 * Connects realtime notifications to HTTP reconciliation for the
 * Adaptive Queue page. Provide it on the page, after the state and
 * realtime services.
 *
 * - Realtime events are invalidation signals only. They flag the
 *   board as possibly stale and schedule an HTTP refresh through the
 *   state service, which keeps one request in flight and queues at
 *   most one follow-up. No event payload ever reaches the board.
 * - Reconciliation runs after the initial connection and after every
 *   successful reconnect. It is not skipped when the first HTTP load
 *   is done, because events published between that response and the
 *   connection would otherwise be missed.
 * - Initial HTTP loading is separate: the page starts it without
 *   waiting for, or depending on, the hub.
 * - The connection is stopped on destruction and on any required
 *   authorization failure. Session end or replacement is handled by
 *   the realtime and state services; this service additionally drops
 *   any scheduled reconciliation that belongs to another session.
 * - There is no polling and no retry loop: the only timers are the
 *   fixed coalescing window and those of the services it uses.
 */
@Injectable()
export class AdaptiveQueueRealtimeCoordinator implements OnDestroy {
  private readonly state = inject(AdaptiveQueueStateService);
  private readonly realtime = inject(AdaptiveQueueRealtimeService);
  private readonly sessionService = inject(SessionService);

  private readonly active = signal(false);

  private subscriptions: Subscription | null = null;
  private reconcileTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingSession: AuthSession | null = null;
  private destroyed = false;

  private readonly authWatcher: EffectRef = effect(() => {
    // Required API 401/403 and roster 401 end up in authFailure.
    if (this.state.authFailure() !== null) {
      untracked(() => this.halt());
    }
  });

  private readonly sessionWatcher: EffectRef = effect(() => {
    this.sessionService.session();
    untracked(() => this.dropForeignPending());
  });

  /** Realtime connection status, separate from HTTP snapshot freshness. */
  readonly connection: Signal<AdaptiveQueueConnectionView> = computed(
    () => {
      switch (this.realtime.status()) {
        case 'connecting':
          return CONNECTION_VIEWS.connecting;
        case 'connected':
          return CONNECTION_VIEWS.connected;
        case 'reconnecting':
          return CONNECTION_VIEWS.reconnecting;
        default:
          return CONNECTION_VIEWS.unavailable;
      }
    },
  );

  /** The status is only meaningful while there is something to show. */
  readonly showConnection: Signal<boolean> = computed(
    () =>
      this.active()
      && this.state.authFailure() === null
      && this.state.viewState() !== 'idle',
  );

  /** A manual reconnect is offered only when it can be authorized. */
  readonly canReconnect: Signal<boolean> = computed(() => {
    const status = this.realtime.status();

    return this.active()
      && (status === 'failed' || status === 'disconnected')
      && this.state.authFailure() === null;
  });

  /**
   * Subscribes to the realtime notifications first, then starts the
   * connection. Does nothing more than that: the initial HTTP load
   * is the caller's responsibility and is independent of the hub.
   */
  activate(): void {
    if (this.destroyed || this.active()) {
      return;
    }

    this.active.set(true);

    const subscriptions = new Subscription();

    subscriptions.add(
      this.realtime.invalidated$.subscribe(event =>
        this.onInvalidated(event),
      ),
    );
    subscriptions.add(
      this.realtime.connected$.subscribe(event =>
        this.onConnected(event),
      ),
    );

    this.subscriptions = subscriptions;

    this.startRealtime();
  }

  /**
   * Manual refresh and retry. Always an HTTP reload, usable whether
   * or not realtime works. Also starts the connection again when it
   * was stopped (for example after a session replacement) and the
   * session is valid. A failed connection is only restarted through
   * `reconnect()`.
   */
  refresh(): void {
    if (this.destroyed) {
      return;
    }

    this.state.refresh();

    if (this.active() && this.realtime.status() === 'disconnected') {
      this.startRealtime();
    }
  }

  /** Manual reconnect. Never touches the HTTP board by itself. */
  reconnect(): void {
    if (this.destroyed || !this.active()) {
      return;
    }

    this.startRealtime();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.active.set(false);

    this.authWatcher.destroy();
    this.sessionWatcher.destroy();

    this.subscriptions?.unsubscribe();
    this.subscriptions = null;

    this.cancelPending();
    this.realtime.stop();
  }

  private startRealtime(): void {
    if (
      this.destroyed
      || !this.active()
      || this.state.authFailure() !== null
      || !this.sessionService.isAuthenticated()
    ) {
      return;
    }

    void this.realtime.start();
  }

  private onInvalidated(event: AdaptiveQueueInvalidation): void {
    void event;

    if (!this.accepting()) {
      return;
    }

    this.state.invalidate();
    this.scheduleReconcile();
  }

  private onConnected(event: AdaptiveQueueRealtimeConnected): void {
    if (!this.accepting()) {
      return;
    }

    if (event.reason === 'reconnected') {
      // Events were possibly missed while disconnected.
      this.state.invalidate();
    }

    this.scheduleReconcile();
  }

  /** False once realtime activity must not influence the board. */
  private accepting(): boolean {
    if (this.destroyed || !this.active()) {
      return false;
    }

    if (
      this.state.authFailure() !== null
      || !this.sessionService.isAuthenticated()
    ) {
      this.halt();
      return false;
    }

    return true;
  }

  private scheduleReconcile(): void {
    if (this.reconcileTimer !== null) {
      // Fixed window: merge into the pending reconciliation.
      return;
    }

    const session = this.sessionService.session();

    if (session === null) {
      return;
    }

    this.pendingSession = session;
    this.reconcileTimer = setTimeout(
      () => this.runReconcile(),
      ADAPTIVE_QUEUE_RECONCILE_WINDOW_MS,
    );
  }

  private runReconcile(): void {
    const session = this.pendingSession;

    this.reconcileTimer = null;
    this.pendingSession = null;

    if (this.destroyed || !this.active()) {
      return;
    }

    if (this.state.authFailure() !== null) {
      this.halt();
      return;
    }

    if (
      session === null
      || this.sessionService.session() !== session
      || !this.sessionService.isAuthenticated()
    ) {
      return;
    }

    this.state.refresh();
  }

  /** Drops a scheduled reconciliation that belongs to another session. */
  private dropForeignPending(): void {
    if (
      this.reconcileTimer !== null
      && (
        this.sessionService.session() !== this.pendingSession
        || !this.sessionService.isAuthenticated()
      )
    ) {
      this.cancelPending();
    }
  }

  private cancelPending(): void {
    if (this.reconcileTimer !== null) {
      clearTimeout(this.reconcileTimer);
      this.reconcileTimer = null;
    }

    this.pendingSession = null;
  }

  /** Ends all realtime activity after an authorization failure. */
  private halt(): void {
    this.cancelPending();
    this.realtime.stop();
  }
}
