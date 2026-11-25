/// Customer telematics snapshot for a job (DriveSense).
class DriveSenseSnapshot {
  const DriveSenseSnapshot({
    required this.vehicleScore,
    required this.roughRoadPercent,
    required this.wearFlags,
    this.optedIn = true,
    this.errorMessage,
  });

  final int vehicleScore;
  final double roughRoadPercent;
  final List<String> wearFlags;
  final bool optedIn;
  final String? errorMessage;

  bool get hasData => errorMessage == null && optedIn;

  String get healthHint {
    if (errorMessage != null) return errorMessage!;
    if (!optedIn) return 'Customer has not opted in to DriveSense.';
    if (vehicleScore >= 80) return 'Vehicle health looks good.';
    if (vehicleScore >= 60) return 'Minor wear detected — mention at handover.';
    return 'Elevated wear — review before closing the job.';
  }

  factory DriveSenseSnapshot.fromJson(Map<String, dynamic> json) {
    final flags = json['wear_flags'] ?? json['wearFlags'];
    return DriveSenseSnapshot(
      vehicleScore:
          ((json['vehicle_score'] ?? json['vehicleScore']) as num?)?.toInt() ??
              0,
      roughRoadPercent:
          ((json['rough_road_percent'] ?? json['roughRoadPercent']) as num?)
                  ?.toDouble() ??
              0,
      wearFlags: flags is List
          ? flags.map((e) => e.toString()).toList()
          : const [],
      optedIn: json['opted_in'] ?? json['optedIn'] ?? true,
      errorMessage: json['error_message'] ?? json['errorMessage'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'vehicle_score': vehicleScore,
        'rough_road_percent': roughRoadPercent,
        'wear_flags': wearFlags,
        'opted_in': optedIn,
        if (errorMessage != null) 'error_message': errorMessage,
      };
}