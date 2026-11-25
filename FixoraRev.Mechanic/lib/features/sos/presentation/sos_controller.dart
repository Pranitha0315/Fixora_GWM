import 'package:flutter/foundation.dart';

import '../../../core/di/app_services.dart';
import '../domain/sos_entities.dart';

class SosController extends ChangeNotifier {
  final List<SosRequest> _requests = [];

  List<SosRequest> get all => List.unmodifiable(_requests);

  List<String> get open => _requests
      .where((r) => r.status.isOpen)
      .map((r) => r.id)
      .toList(growable: false);

  SosRequest? byId(String id) {
    for (final r in _requests) {
      if (r.id == id) return r;
    }
    return null;
  }

  void seedDemo() {
    if (_requests.isNotEmpty) return;
    final mech = AppServices.auth.user?.id ?? 'mech-demo';
    _requests.addAll([
      SosRequest(
        id: 'sos-1',
        customerName: 'Priya N.',
        vehicleReg: 'TN09 AB 1234',
        location: 'OMR, Chennai',
        severity: SosSeverity.high,
        status: SosStatus.assigned,
        assignedMechanicId: mech,
        summary: 'Engine stall, customer stranded.',
        createdAt: DateTime.now().subtract(const Duration(minutes: 12)),
      ),
      SosRequest(
        id: 'sos-2',
        customerName: 'Raj K.',
        vehicleReg: 'KA05 CD 9988',
        location: 'Whitefield, Bengaluru',
        severity: SosSeverity.medium,
        status: SosStatus.pending,
        summary: 'Flat tyre, needs mobile assist.',
        createdAt: DateTime.now().subtract(const Duration(hours: 1)),
      ),
    ]);
    notifyListeners();
  }

  String? get _mechanicId => AppServices.auth.user?.id;

  void _ensureAllowed(SosRequest request) {
    if (!canMechanicAct(request, _mechanicId)) {
      throw SosPermissionDenied(
        'You are not assigned to this SOS request.',
      );
    }
  }

  void assignToMe(String requestId) {
    final req = byId(requestId);
    if (req == null) return;
    final mech = _mechanicId;
    if (mech == null || mech.isEmpty) {
      throw SosPermissionDenied('Sign in to accept SOS assignments.');
    }
  final i = _requests.indexWhere((r) => r.id == requestId);
    if (i < 0) return;
    _requests[i] = req.copyWith(
      status: SosStatus.assigned,
      assignedMechanicId: mech,
    );
    notifyListeners();
  }

  void accept(String requestId) {
    final req = byId(requestId);
    if (req == null) return;
    _ensureAllowed(req);
    final i = _requests.indexWhere((r) => r.id == requestId);
    if (i < 0) return;
    _requests[i] = req.copyWith(status: SosStatus.accepted);
    notifyListeners();
  }

  void updateStatus(String requestId, SosStatus status) {
    final req = byId(requestId);
    if (req == null) return;
    _ensureAllowed(req);
    final i = _requests.indexWhere((r) => r.id == requestId);
    if (i < 0) return;
    _requests[i] = req.copyWith(status: status);
    notifyListeners();
  }

  void replaceAll(List<SosRequest> list) {
    _requests
      ..clear()
      ..addAll(list);
    notifyListeners();
  }
}