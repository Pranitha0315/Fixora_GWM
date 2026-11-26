/// DriveSense wear / rough-road hints (customer must opt in).
class DriveSenseSnapshot {
  const DriveSenseSnapshot({
    required this.vehicleScore,
    required this.roughRoadPercent,
    required this.wearFlags,
    required this.optedIn,
    this.errorMessage,
  });

  final int vehicleScore;
  final double roughRoadPercent;
  final List<String> wearFlags;
  final bool optedIn;
  final String? errorMessage;

  bool get hasData => optedIn && errorMessage == null && (wearFlags.isNotEmpty || vehicleScore > 0);

  static const empty = DriveSenseSnapshot(
    vehicleScore: 0,
    roughRoadPercent: 0,
    wearFlags: [],
    optedIn: false,
  );
}
