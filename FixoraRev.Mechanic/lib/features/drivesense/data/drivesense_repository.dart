import '../../../core/backend/api_client.dart';
import '../../../core/di/app_services.dart';
import '../domain/drivesense_models.dart';

/// Fetches DriveSense snapshots (API with demo fallback).
class DriveSenseRepository {
  DriveSenseRepository({ApiClient? api}) : _api = api ?? AppServices.api;

  final ApiClient _api;

  Future<DriveSenseSnapshot> fetchSnapshot(String jobId) async {
    try {
      final raw = await _api.get('/mechanic/jobs/$jobId/drivesense');
      if (raw is Map) {
        return DriveSenseSnapshot.fromJson(Map<String, dynamic>.from(raw));
      }
    } catch (_) {
      // Demo data when offline / unsigned.
    }
    return _demoFor(jobId);
  }

  DriveSenseSnapshot _demoFor(String jobId) {
    final hash = jobId.hashCode.abs();
    final score = 55 + (hash % 40);
    return DriveSenseSnapshot(
      vehicleScore: score,
      roughRoadPercent: (hash % 30) + 5.0,
      wearFlags: score < 70
          ? const ['Brake pads', 'Tyre front-left']
          : const ['Oil interval'],
      optedIn: true,
    );
  }
}