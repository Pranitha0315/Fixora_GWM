import '../../../core/backend/mechanic_backend.dart';
import '../domain/drivesense_models.dart';

/// Loads DriveSense hints for a job/vehicle.
/// Live: reads `driveSense` from GET /mechanic/jobs/{id} (server enforces the customer's opt-in).
/// Demo: returns mock opted-in data.
class DriveSenseRepository {
  Future<DriveSenseSnapshot> forJob(String jobId, {required bool customerOptedIn}) async {
    if (!customerOptedIn) return DriveSenseSnapshot.empty;
    if (MechanicBackend.instance.live) {
      // A job made from a sample SOS lives only on this phone: there is no server DriveSense for it.
      if (!MechanicBackend.isServerId(jobId)) return DriveSenseSnapshot.empty;
      return _fromServer(jobId);
    }
    await Future<void>.delayed(const Duration(milliseconds: 250));
    if (jobId.toLowerCase().contains('err')) {
      return const DriveSenseSnapshot(
        vehicleScore: 0,
        roughRoadPercent: 0,
        wearFlags: [],
        optedIn: true,
        errorMessage: 'Could not load DriveSense data. Try again.',
      );
    }
    return DriveSenseSnapshot(
      vehicleScore: 72,
      roughRoadPercent: 18.5,
      wearFlags: const [
        'Front suspension load spikes',
        'Brake pad wear trend rising',
        'Tyre sidewall stress on left rear',
      ],
      optedIn: true,
    );
  }

  Future<DriveSenseSnapshot> _fromServer(String jobId) async {
    try {
      final detail = await MechanicBackend.instance.jobDetail(jobId);
      final hint = detail['driveSense'] as Map<String, dynamic>?;
      // Null = the customer has not opted in, or no trip data yet. The server never sends hints otherwise.
      if (hint == null) return DriveSenseSnapshot.empty;
      return DriveSenseSnapshot(
        vehicleScore: (hint['driveScore'] as num?)?.toInt() ?? 0,
        roughRoadPercent: (hint['roughRoadPct'] as num?)?.toDouble() ?? 0,
        wearFlags: ((hint['topFlags'] as List?) ?? const []).cast<String>(),
        optedIn: true,
      );
    } catch (_) {
      return const DriveSenseSnapshot(
        vehicleScore: 0,
        roughRoadPercent: 0,
        wearFlags: [],
        optedIn: true,
        errorMessage: 'Could not load DriveSense data. Try again.',
      );
    }
  }
}
