import '../../../core/backend/mechanic_backend.dart';

class QueueRefresh {
  QueueRefresh._();

  static Future<void> pull() => MechanicBackend.instance.pullRefresh();

  static Future<void> reloadAssignedJobs() =>
      MechanicBackend.instance.refreshJobs();
}
