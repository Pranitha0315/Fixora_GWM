import '../domain/drivesense_models.dart';

/// Loads DriveSense hints for a job/vehicle. Demo returns mock opted-in data.
class DriveSenseRepository {
  Future<DriveSenseSnapshot> forJob(String jobId, {required bool customerOptedIn}) async {
    await Future<void>.delayed(const Duration(milliseconds: 250));
    if (!customerOptedIn) return DriveSenseSnapshot.empty;
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
}
