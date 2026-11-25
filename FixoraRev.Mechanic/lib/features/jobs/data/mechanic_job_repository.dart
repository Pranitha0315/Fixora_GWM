import '../../../core/backend/api_client.dart';
import '../domain/job_entities.dart';

class MechanicJobRepository {
  MechanicJobRepository({required ApiClient api}) : _api = api;

  final ApiClient _api;

  Future<List<Job>> fetchAssigned() async {
    final raw = await _api.get('/mechanic/jobs/assigned');
    final list = <Job>[];
    if (raw is List) {
      for (final item in raw) {
        if (item is Map) {
          list.add(Job.fromJson(Map<String, dynamic>.from(item)));
        }
      }
    } else if (raw is Map && raw['jobs'] is List) {
      for (final item in raw['jobs'] as List) {
        if (item is Map) {
          list.add(Job.fromJson(Map<String, dynamic>.from(item)));
        }
      }
    }
    return list;
  }

  Future<void> startJob(String jobId) =>
      _action(jobId, 'start_repair');

  Future<void> pauseJob(String jobId) => _action(jobId, 'pause');

  Future<void> resumeJob(String jobId) => _action(jobId, 'resume');

  Future<void> completeJob(String jobId) => _action(jobId, 'complete');

  Future<void> _action(String jobId, String action) => _api.post(
        '/mechanic/jobs/$jobId/actions',
        body: {'action': action},
      );
}