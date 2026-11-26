import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/mock/mock_data.dart';
import '../../domain/entities/evidence_record.dart';

class EvidenceNotifier extends Notifier<List<EvidenceRecord>> {
  int _counter = 100;

  @override
  List<EvidenceRecord> build() => List<EvidenceRecord>.from(MockData.evidence);

  void add({
    required String jobId,
    required String label,
    required EvidencePhase phase,
    required MediaKind kind,
    String? localPath,
    EvidenceUploadStatus uploadStatus = EvidenceUploadStatus.local,
  }) {
    _counter++;
    final now = DateTime.now();
    final time = '${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}';
    state = [
      ...state,
      EvidenceRecord(
        id: 'e$_counter',
        jobId: jobId,
        label: label,
        phase: phase,
        kind: kind,
        time: time,
        localPath: localPath,
        uploadStatus: uploadStatus,
      ),
    ];
  }

  /// Marks upload done and keeps the record linked to [jobId].
  void markUploaded(String id) {
    state = [
      for (final e in state)
        e.id == id
            ? EvidenceRecord(
                id: e.id,
                jobId: e.jobId,
                label: e.label,
                phase: e.phase,
                kind: e.kind,
                time: e.time,
                localPath: e.localPath,
                uploadStatus: EvidenceUploadStatus.uploaded,
              )
            : e,
    ];
  }
}

final evidenceProvider =
    NotifierProvider<EvidenceNotifier, List<EvidenceRecord>>(EvidenceNotifier.new);
