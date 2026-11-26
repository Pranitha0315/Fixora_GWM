import '../../../core/backend/mechanic_backend.dart';

/// Pull / realtime assignment refresh for the queue board.
///
/// Manager reassignment arrives over SignalR as `job*` / `queue*` notifications;
/// [MechanicBackend] already calls [MechanicBackend.refreshJobs] for those events.
class QueueRefresh {
  QueueRefresh._();

  static Future<void> pull() => MechanicBackend.instance.pullRefresh();

  static Future<void> reloadAssignedJobs() => MechanicBackend.instance.refreshJobs();
}
