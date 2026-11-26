import 'package:flutter/foundation.dart';

import '../../../core/di/app_services.dart';
import '../domain/sos_entities.dart';

/// Roadside SOS requests routed to this mechanic (BRD USP 2).
class SosController extends ChangeNotifier {
  SosController(this._requests);

  final List<SosRequest> _requests;

  List<SosRequest> get open => _requests.where((r) => r.isOpen).toList();
  List<SosRequest> get all => List.unmodifiable(_requests);

  /// Replaces the demo requests with the SOS alerts the backend routed to this mechanic.
  void replaceAll(List<SosRequest> list) {
    _requests
      ..clear()
      ..addAll(list);
    notifyListeners();
  }

  SosRequest? get latestPending {
    for (final r in _requests) {
      if (r.status == SosStatus.pending) return r;
    }
    return null;
  }

  void _ensureAllowed(SosRequest r) {
    final me = AppServices.auth.user?.id;
    if (!r.canMechanicAct(me)) {
      throw StateError('Only the assigned mechanic can update this SOS.');
    }
  }

  void accept(SosRequest r) {
    _ensureAllowed(r);
    r.status = SosStatus.accepted;
    r.assignedMechanicId ??= AppServices.auth.user?.id;
    notifyListeners();
  }

  void startNavigation(SosRequest r) {
    _ensureAllowed(r);
    r.status = SosStatus.enRoute;
    notifyListeners();
  }

  void arrived(SosRequest r) {
    _ensureAllowed(r);
    r.status = SosStatus.arrived;
    r.etaMinutes = 0;
    notifyListeners();
  }

  void resolveOnSite(SosRequest r) {
    _ensureAllowed(r);
    r.status = SosStatus.resolvedOnSite;
    notifyListeners();
  }

  void decline(SosRequest r) {
    _ensureAllowed(r);
    r.status = SosStatus.declined;
    notifyListeners();
  }

  /// Vehicle needs the workshop: create a priority job in the queue.
  String convertToJob(SosRequest r) {
    _ensureAllowed(r);
    final job = AppServices.jobs.addSosJob(r);
    r.status = SosStatus.converted;
    r.jobId = job.id;
    notifyListeners();
    return job.id;
  }
}
