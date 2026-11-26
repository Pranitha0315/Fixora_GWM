import '../../di/app_services.dart';
import '../api_client.dart';
import '../mechanic_backend.dart';
import '../../../features/jobs/domain/job_entities.dart';

/// Typed repository over mechanic job APIs.
class MechanicJobRepository {
  MechanicJobRepository({MechanicBackend? backend}) : _be = backend ?? MechanicBackend.instance;

  final MechanicBackend _be;

  Future<List<Job>> fetchAssigned() async {
    await _be.refreshJobs();
    return AppServices.jobs.all;
  }

  Future<void> startPauseResume(String jobId, String action, {String? message}) async {
    try {
      await _be.jobAction(jobId, action, message: message);
    } on ApiException {
      rethrow;
    }
  }

  Future<void> complete(String jobId) => _be.jobAction(jobId, 'complete');
}
