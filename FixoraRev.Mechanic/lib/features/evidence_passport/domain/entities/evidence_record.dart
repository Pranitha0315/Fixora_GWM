enum EvidencePhase { before, inspection, after }

extension EvidencePhaseX on EvidencePhase {
  String get label {
    switch (this) {
      case EvidencePhase.before:
        return 'Check-in · Before';
      case EvidencePhase.inspection:
        return 'Inspection';
      case EvidencePhase.after:
        return 'Repair · After';
    }
  }
}

enum MediaKind { photo, video }

enum EvidenceUploadStatus { local, uploading, uploaded, failed }

class EvidenceRecord {
  const EvidenceRecord({
    required this.id,
    required this.jobId,
    required this.label,
    required this.phase,
    required this.kind,
    required this.time,
    this.localPath,
    this.uploadStatus = EvidenceUploadStatus.local,
  });

  final String id;
  final String jobId;
  final String label;
  final EvidencePhase phase;
  final MediaKind kind;
  final String time;
  final String? localPath;
  final EvidenceUploadStatus uploadStatus;
}
