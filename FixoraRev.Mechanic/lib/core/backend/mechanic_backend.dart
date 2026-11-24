import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/jobs/domain/job_entities.dart';
import '../../features/jobs/presentation/job_controller.dart';
import '../di/app_services.dart';
import 'api_client.dart';

/// App-wide backend facade shared with Riverpod [ProviderContainer].
class MechanicBackend extends ChangeNotifier {
  MechanicBackend._();

  static final MechanicBackend instance = MechanicBackend._();

  ProviderContainer? container;

  final ApiClient api = ApiClient('fixora.mechanic.session');

  bool live = false;
  bool get enabled => live || api.signedIn;

  /// Simple event sink for SignalR / poll stubs (job* / queue*).
  final StreamController<String> _events =
      StreamController<String>.broadcast();

  StreamSubscription<String>? _eventSub;

  Future<void> bootstrap() async {
    await api.restore();
    _listenRealtime();
  }

  void _listenRealtime() {
    _eventSub?.cancel();
    _eventSub = _events.stream.listen((type) {
      if (type.startsWith('proposal') ||
          type.startsWith('approval') ||
          type.startsWith('job') ||
          type.startsWith('queue')) {
        unawaited(refreshJobs().catchError((Object _) {}));
      }
    });
  }

  /// Test / hub hook — push a realtime event type.
  void emitRealtime(String type) => _events.add(type);

  /// Sign in with employee code (EMP-001) / phone and the 4-digit garage PIN.
  Future<void> pinLogin(String login, String pin) async {
    final tokens = await api.post(
      '/mechanic/auth/pin-login',
      body: {'login': login, 'pin': pin},
    ) as Map<String, dynamic>;
    await api.saveSession(tokens);
    await _afterLogin();
  }

  /// Quick login: restore saved session (refresh) after local PIN check.
  Future<bool> resume() async {
    try {
      await api.restore();
      if (!api.signedIn) return false;
      if (await api.refresh() == null) return false;
      await _afterLogin();
      return true;
    } catch (_) {
      return false;
    }
  }

  /// Accept a manager's 7-day invitation: name + PIN → session tokens.
  Future<void> acceptInvitation({
    required String token,
    required String name,
    required String pin,
  }) async {
    final raw = await api.post(
      '/mechanic/auth/accept-invitation',
      body: {
        'token': token,
        'name': name,
        'pin': pin,
      },
    );
    if (raw is! Map) {
      throw ApiException(
        'Invalid invitation response',
        code: 'invalid_invite_response',
      );
    }
    await api.saveSession(Map<String, dynamic>.from(raw));
    await _afterLogin();
  }

  Future<void> _afterLogin() async {
    live = true;
    await refreshJobs().catchError((Object _) {});
    notifyListeners();
  }

  /// Start / pause / complete etc. (JobActionRequest). Manager + customer follow live.
  Future<void> jobAction(
    String jobId,
    String action, {
    String? stage,
    String? message,
    int? percent,
  }) async {
    if (!live) return;
    await api.post(
      '/mechanic/jobs/$jobId/actions',
      body: {
        'action': action,
        'stage': stage,
        'message': message,
        'percent': percent,
      },
    );
    await refreshJobs();
  }

  /// Reload assigned jobs from API (manager reassignment / queue updates).
  Future<void> refreshJobs() async {
    try {
      if (!api.signedIn && !live) {
        notifyListeners();
        return;
      }
      final raw = await api.get('/mechanic/jobs/assigned');
      final list = <Job>[];
      if (raw is List) {
        for (final item in raw) {
          if (item is Map) {
            list.add(Job.fromJson(Map<String, dynamic>.from(item)));
          }
        }
      } else if (raw is Map && raw['jobs'] is List) {
        for (final item in raw['jobs'] as List) {
          if (item is Map) {
            list.add(Job.fromJson(Map<String, dynamic>.from(item)));
          }
        }
      }
      if (list.isNotEmpty) {
        AppServices.jobs.replaceAll(list);
      }
    } catch (_) {
      // Keep local/demo queue when offline.
    }
    notifyListeners();
  }

  Future<void> pullRefresh() async {
    await refreshJobs();
  }

  Future<void> logout() async {
    try {
      if (api.signedIn) {
        await api.post('/mechanic/auth/logout');
      }
    } catch (_) {
      // Best-effort.
    }
    await api.clear();
    live = false;
    notifyListeners();
  }

  void disposeHub() {
    _eventSub?.cancel();
    _events.close();
  }
}
