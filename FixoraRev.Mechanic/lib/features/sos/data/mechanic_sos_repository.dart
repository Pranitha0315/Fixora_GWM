import '../../../core/backend/api_client.dart';
import '../domain/sos_entities.dart';

class MechanicSosRepository {
  MechanicSosRepository({required ApiClient api}) : _api = api;

  final ApiClient _api;

  Future<List<SosRequest>> fetchAlerts() async {
    final raw = await _api.get('/mechanic/sos/alerts');
    final list = <SosRequest>[];
    if (raw is List) {
      for (final item in raw) {
        if (item is Map) {
          list.add(SosRequest.fromJson(Map<String, dynamic>.from(item)));
        }
      }
    } else if (raw is Map && raw['alerts'] is List) {
      for (final item in raw['alerts'] as List) {
        if (item is Map) {
          list.add(SosRequest.fromJson(Map<String, dynamic>.from(item)));
        }
      }
    }
    return list;
  }

  Future<void> updateStatus(String requestId, SosStatus status) => _api.put(
        '/mechanic/sos/$requestId',
        body: {'status': status.name},
      );
}