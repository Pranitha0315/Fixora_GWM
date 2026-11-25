/// Roadside / breakdown severity.
enum SosSeverity {
  low,
  medium,
  high,
  critical;

  String get label => switch (this) {
        SosSeverity.low => 'Low',
        SosSeverity.medium => 'Medium',
        SosSeverity.high => 'High',
        SosSeverity.critical => 'Critical',
      };
}

/// Lifecycle of an SOS request.
enum SosStatus {
  pending,
  assigned,
  accepted,
  enRoute,
  onScene,
  resolved,
  cancelled;

  String get label => switch (this) {
        SosStatus.pending => 'Pending',
        SosStatus.assigned => 'Assigned',
        SosStatus.accepted => 'Accepted',
        SosStatus.enRoute => 'En route',
        SosStatus.onScene => 'On scene',
        SosStatus.resolved => 'Resolved',
        SosStatus.cancelled => 'Cancelled',
      };

  bool get isOpen =>
      this != SosStatus.resolved && this != SosStatus.cancelled;
}

class SosPermissionDenied implements Exception {
  SosPermissionDenied(this.message);

  final String message;

  @override
  String toString() => message;
}

class SosRequest {
  const SosRequest({
    required this.id,
    required this.customerName,
    required this.vehicleReg,
    required this.location,
    required this.severity,
    required this.status,
    this.assignedMechanicId,
    this.summary = '',
    this.createdAt,
  });

  final String id;
  final String customerName;
  final String vehicleReg;
  final String location;
  final SosSeverity severity;
  final SosStatus status;
  final String? assignedMechanicId;
  final String summary;
  final DateTime? createdAt;

  SosRequest copyWith({
    SosStatus? status,
    String? assignedMechanicId,
  }) {
    return SosRequest(
      id: id,
      customerName: customerName,
      vehicleReg: vehicleReg,
      location: location,
      severity: severity,
      status: status ?? this.status,
      assignedMechanicId: assignedMechanicId ?? this.assignedMechanicId,
      summary: summary,
      createdAt: createdAt,
    );
  }

  factory SosRequest.fromJson(Map<String, dynamic> json) {
    return SosRequest(
      id: (json['id'] ?? '').toString(),
      customerName: (json['customer_name'] ?? json['customerName'] ?? '')
          .toString(),
      vehicleReg: (json['vehicle_reg'] ?? json['vehicleReg'] ?? '').toString(),
      location: (json['location'] ?? '').toString(),
      severity: _severityFrom(json['severity']),
      status: _statusFrom(json['status']),
      assignedMechanicId:
          (json['assigned_mechanic_id'] ?? json['assignedMechanicId'])
              ?.toString(),
      summary: (json['summary'] ?? '').toString(),
      createdAt: json['created_at'] != null
          ? DateTime.tryParse(json['created_at'].toString())
          : null,
    );
  }

  static SosSeverity _severityFrom(Object? raw) {
    final s = raw?.toString().toLowerCase() ?? '';
    return SosSeverity.values.firstWhere(
      (e) => e.name == s,
      orElse: () => SosSeverity.medium,
    );
  }

  static SosStatus _statusFrom(Object? raw) {
    final s = raw?.toString().toLowerCase() ?? '';
    return SosStatus.values.firstWhere(
      (e) => e.name == s.replaceAll(' ', ''),
      orElse: () => SosStatus.pending,
    );
  }
}

/// Whether the signed-in mechanic may act on this request.
bool canMechanicAct(SosRequest request, String? mechanicId) {
  if (mechanicId == null || mechanicId.isEmpty) return false;
  if (!request.status.isOpen) return false;
  if (request.assignedMechanicId == null ||
      request.assignedMechanicId!.isEmpty) {
    return false;
  }
  return request.assignedMechanicId == mechanicId;
}