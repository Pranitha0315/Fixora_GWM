import 'package:flutter/foundation.dart';

import '../../../core/backend/mechanic_backend.dart';
import '../../../core/di/app_services.dart';
import '../domain/sos_entities.dart';

/// Roadside SOS requests routed to this mechanic. Each step is a backend status change
/// (`POST /mechanic/sos/{id}/status`): Acknowledged, Dispatched, OnSite, Resolved.
class SosController extends ChangeNotifier {
  SosController(this._requests);

  final List<SosRequest> _requests;

  List<SosRequest> get open => _requests.where((r) => r.isOpen).toList();
  List<SosRequest> get all => List.unmodifiable(_requests);

  /// Replaces the requests with the SOS alerts the backend routed to this mechanic.
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

  /// Accept the request: backend status Acknowledged. The phone changes only after the server accepts.
  Future<void> accept(SosRequest r) async {
    _ensureAllowed(r);
    await _pushStatus(r, 'Acknowledged');
    r.status = SosStatus.accepted;
    r.assignedMechanicId ??= AppServices.auth.user?.id;
    notifyListeners();
  }

  /// On the way: backend status Dispatched.
  Future<void> startNavigation(SosRequest r) async {
    _ensureAllowed(r);
    await _pushStatus(r, 'Dispatched');
    r.status = SosStatus.enRoute;
    notifyListeners();
  }

  /// Reached the customer: backend status OnSite.
  Future<void> arrived(SosRequest r) async {
    _ensureAllowed(r);
    await _pushStatus(r, 'OnSite');
    r.status = SosStatus.arrived;
    notifyListeners();
  }

  /// Fixed on the spot: backend status Resolved.
  Future<void> resolveOnSite(SosRequest r) async {
    _ensureAllowed(r);
    await _pushStatus(r, 'Resolved');
    r.status = SosStatus.resolvedOnSite;
    notifyListeners();
  }

  Future<void> _pushStatus(SosRequest r, String status) async {
    final be = MechanicBackend.instance;
    if (!be.live) throw StateError('Not connected to the garage server.');
    await be.sosStatus(r.id, status);
  }
}
