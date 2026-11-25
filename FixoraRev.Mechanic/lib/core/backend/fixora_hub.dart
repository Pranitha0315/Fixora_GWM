import 'dart:async';

import 'mechanic_backend.dart';

/// Lightweight SignalR / realtime hub stub.
class FixoraHub {
  FixoraHub._();

  static final FixoraHub instance = FixoraHub._();

  final StreamController<String> _local =
      StreamController<String>.broadcast();

  Stream<String> get events => _local.stream;

  /// Emit a typed realtime event (job*, queue*, sos*).
  void emit(String type) {
    if (MechanicBackend.instance.live) {
      MechanicBackend.instance.emitRealtime(type);
    } else {
      _local.add(type);
    }
  }

  void emitJobUpdated(String jobId) => emit('job:$jobId');

  void emitQueueRefresh() => emit('queue:refresh');

  void emitSosAlert(String requestId) => emit('sos:$requestId');

  void dispose() {
    _local.close();
  }
}