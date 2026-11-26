import '../../di/app_services.dart';
import '../api_client.dart';
import '../mechanic_backend.dart';
import '../../../features/sos/domain/sos_entities.dart';

class MechanicSosRepository {
  MechanicSosRepository({MechanicBackend? backend}) : _be = backend ?? MechanicBackend.instance;

  final MechanicBackend _be;

  Future<List<SosRequest>> fetchAlerts() async {
    await _be.refreshSos();
    return AppServices.sos.all;
  }

  Future<void> updateStatus(String id, String status, {String? note}) async {
    try {
      await _be.sosStatus(id, status, note: note);
    } on ApiException {
      rethrow;
    }
  }
}
