import '../../jobs/domain/job_entities.dart';

/// SOS statuses the mechanic app can move through. Each one is a backend status:
/// pending (Received, sent to the mechanic), accepted (Acknowledged), enRoute (Dispatched),
/// arrived (OnSite), resolvedOnSite (Resolved).
enum SosStatus {
  pending,
  accepted,
  enRoute,
  arrived,
  resolvedOnSite,
}

extension SosStatusX on SosStatus {
  String get label => switch (this) {
        SosStatus.pending => 'New request',
        SosStatus.accepted => 'Accepted',
        SosStatus.enRoute => 'On the way',
        SosStatus.arrived => 'Arrived',
        SosStatus.resolvedOnSite => 'Fixed on the spot',
      };
}

class SosRequest {
  SosRequest({
    required this.id,
    required this.customer,
    required this.vehicle,
    required this.issue,
    required this.locationLabel,
    required this.receivedAt,
    this.status = SosStatus.pending,
    this.lat,
    this.lng,
  });

  final String id;
  final Customer customer;
  final Vehicle vehicle;
  final String issue;
  final String locationLabel;
  final DateTime receivedAt;
  SosStatus status;
  final double? lat;
  final double? lng;

  bool get hasLocation => lat != null && lng != null;

  /// Assigned mechanic id from backend (null = open pool).
  String? assignedMechanicId;

  bool get isOpen => status != SosStatus.resolvedOnSite;

  /// Only the assigned mechanic (or unassigned pool) may act.
  bool canMechanicAct(String? mechanicId) {
    if (assignedMechanicId == null || assignedMechanicId!.isEmpty) return true;
    if (mechanicId == null || mechanicId.isEmpty) return false;
    return assignedMechanicId == mechanicId;
  }
}
