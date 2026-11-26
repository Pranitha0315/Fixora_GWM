import '../../jobs/domain/job_entities.dart';

enum SosStatus {
  pending,
  accepted,
  enRoute,
  arrived,
  converted,
  resolvedOnSite,
  declined
}

extension SosStatusX on SosStatus {
  String get label => switch (this) {
        SosStatus.pending => 'New request',
        SosStatus.accepted => 'Accepted',
        SosStatus.enRoute => 'On the way',
        SosStatus.arrived => 'Arrived',
        SosStatus.converted => 'Added to queue',
        SosStatus.resolvedOnSite => 'Fixed on the spot',
        SosStatus.declined => 'Declined',
      };
}

/// How the request reached the garage (BRD USP 2).
enum SosChannel { online, bleRelay }

class SosRequest {
  SosRequest({
    required this.id,
    required this.customer,
    required this.vehicle,
    required this.issue,
    required this.locationLabel,
    required this.distanceKm,
    required this.channel,
    required this.receivedAt,
    this.hops = 0,
    this.status = SosStatus.pending,
    this.etaMinutes = 14,
    this.jobId,
  });

  final String id;
  final Customer customer;
  final Vehicle vehicle;
  final String issue;
  final String locationLabel;
  final double distanceKm;
  final SosChannel channel;
  final DateTime receivedAt;
  final int hops;
  SosStatus status;
  int etaMinutes;
  String? jobId;

  /// Assigned mechanic id from backend (null = open pool).
  String? assignedMechanicId;

  bool get isOpen =>
      status != SosStatus.converted &&
      status != SosStatus.declined &&
      status != SosStatus.resolvedOnSite;

  /// Only the assigned mechanic (or unassigned pool) may act.
  bool canMechanicAct(String? mechanicId) {
    if (assignedMechanicId == null || assignedMechanicId!.isEmpty) return true;
    if (mechanicId == null || mechanicId.isEmpty) return false;
    return assignedMechanicId == mechanicId;
  }

  String get channelLabel => channel == SosChannel.online
      ? 'Online (mobile data)'
      : 'Offline BLE relay · $hops hop${hops == 1 ? '' : 's'}';
}
