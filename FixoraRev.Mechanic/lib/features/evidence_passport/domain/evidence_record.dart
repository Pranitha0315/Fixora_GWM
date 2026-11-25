enum EvidencePhase { before, inspection, after }

extension EvidencePhaseX on EvidencePhase {
  String get label => switch (this) {
        EvidencePhase.before => 'Before',
        EvidencePhase.inspection => 'Inspection',
        EvidencePhase.after => 'After',
      };
}

enum EvidenceUploadStatus { local, uploading, uploaded, failed }

class EvidenceRecord {
  EvidenceRecord({
    required this.phase,
    required this.localPath,
    required this.caption,
    this.status = EvidenceUploadStatus.local,
    String? id,
    DateTime? capturedAt,
  })  : id = id ?? DateTime.now().millisecondsSinceEpoch.toString(),
        capturedAt = capturedAt ?? DateTime.now();

  final String id;
  final EvidencePhase phase;
  final String localPath;
  final String caption;
  EvidenceUploadStatus status;
  final DateTime capturedAt;
}