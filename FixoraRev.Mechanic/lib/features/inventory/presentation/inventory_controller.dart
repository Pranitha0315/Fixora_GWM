import 'package:flutter/foundation.dart';

import '../../jobs/domain/job_entities.dart';
import '../domain/part.dart';

/// Three-state stock + job-linked availability (BRD USP 4).
class InventoryController extends ChangeNotifier {
  InventoryController(this._parts);

  final List<Part> _parts;

  List<Part> get parts => List.unmodifiable(_parts);

  Part? byId(String id) {
    for (final p in _parts) {
      if (p.id == id) return p;
    }
    return null;
  }

  /// Availability of one estimate line, taking what is already reserved
  /// for this job into account.
  PartAvailability lineAvailability(EstimateLine line) {
    final missing = line.qty - line.reservedQty;
    if (missing <= 0) return PartAvailability.ready;
    final part = byId(line.partId);
    if (part == null) return PartAvailability.blocked;
    if (part.available >= missing) return PartAvailability.ready;
    if (part.available + part.incoming >= missing) {
      return PartAvailability.partial;
    }
    return PartAvailability.blocked;
  }

  PartAvailability jobAvailability(Job job) {
    final estimate = job.estimate;
    if (estimate == null || estimate.lines.isEmpty) {
      return PartAvailability.ready;
    }
    var worst = PartAvailability.ready;
    for (final line in estimate.lines) {
      final a = lineAvailability(line);
      if (a.rank > worst.rank) worst = a;
    }
    return worst;
  }

  /// Substitutes that can cover [qty] right now.
  List<Part> substitutesFor(String partId, {int qty = 1}) {
    final part = byId(partId);
    if (part == null) return const [];
    return part.substituteIds
        .map(byId)
        .whereType<Part>()
        .where((p) => p.available >= qty)
        .toList();
  }

  /// Holds stock for an approved job. Reserves what is on the shelf; the
  /// rest stays amber/red until it arrives.
  void reserve(EstimateLine line) {
    final part = byId(line.partId);
    if (part == null) return;
    final missing = line.qty - line.reservedQty;
    if (missing <= 0) return;
    final take = missing <= part.available ? missing : part.available;
    part.available -= take;
    part.reserved += take;
    line.reservedQty += take;
    notifyListeners();
  }

  void release(EstimateLine line) {
    final part = byId(line.partId);
    if (part == null || line.reservedQty == 0) return;
    part.reserved -= line.reservedQty;
    part.available += line.reservedQty;
    line.reservedQty = 0;
    notifyListeners();
  }

  /// Parts fitted on completion leave the reserved pool.
  void consume(EstimateLine line) {
    final part = byId(line.partId);
    if (part == null) return;
    part.reserved -= line.reservedQty;
    if (part.reserved < 0) part.reserved = 0;
    line.reservedQty = 0;
    notifyListeners();
  }

  /// Supplier delivery arrived: incoming stock becomes available.
  void receiveIncoming(Part part) {
    part.available += part.incoming;
    part.incoming = 0;
    part.incomingEta = null;
    notifyListeners();
  }

  void reorder(Part part, int qty) {
    part.incoming += qty;
    part.incomingEta = DateTime.now().add(const Duration(days: 2));
    notifyListeners();
  }

  /// Units of each part needed by upcoming (not yet reserved) jobs.
  Map<String, int> upcomingDemand(Iterable<Job> jobs) {
    final demand = <String, int>{};
    for (final job in jobs) {
      if (!job.status.isActive || job.estimate == null) continue;
      for (final line in job.estimate!.lines) {
        final need = line.qty - line.reservedQty;
        if (need > 0) demand[line.partId] = (demand[line.partId] ?? 0) + need;
      }
    }
    return demand;
  }
}
