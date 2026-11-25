import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';

import '../../domain/evidence_record.dart';

class EvidenceState {
  const EvidenceState({this.records = const []});

  final List<EvidenceRecord> records;

  EvidenceState copyWith({List<EvidenceRecord>? records}) =>
      EvidenceState(records: records ?? this.records);

  List<EvidenceRecord> forPhase(EvidencePhase phase) =>
      records.where((r) => r.phase == phase).toList(growable: false);
}

class EvidenceNotifier extends Notifier<Map<String, EvidenceState>> {
  @override
  Map<String, EvidenceState> build() => {};

  EvidenceState stateFor(String jobId) =>
      state[jobId] ?? const EvidenceState();

  Future<void> add(
    String jobId, {
    required EvidencePhase phase,
    String? caption,
  }) async {
    String path;
    try {
      final dir = await getTemporaryDirectory();
      path = '${dir.path}/evidence_${jobId}_${DateTime.now().millisecondsSinceEpoch}.jpg';
    } catch (_) {
      path = '/tmp/evidence_${jobId}_${DateTime.now().millisecondsSinceEpoch}.jpg';
    }
    final record = EvidenceRecord(
      phase: phase,
      localPath: path,
      caption: caption ?? '${phase.label} capture',
    );
    final current = stateFor(jobId);
    state = {
      ...state,
      jobId: current.copyWith(records: [...current.records, record]),
    };
    unawaited(upload(jobId, record.id));
  }

  Future<void> upload(String jobId, String recordId) async {
    final current = stateFor(jobId);
    final index = current.records.indexWhere((r) => r.id == recordId);
    if (index < 0) return;
    final record = current.records[index];
    record.status = EvidenceUploadStatus.uploading;
    _replaceRecord(jobId, record);

    await Future<void>.delayed(const Duration(milliseconds: 500));
    record.status = EvidenceUploadStatus.uploaded;
    _replaceRecord(jobId, record);
  }

  Future<void> retry(String jobId, String recordId) =>
      upload(jobId, recordId);

  void _replaceRecord(String jobId, EvidenceRecord record) {
    final current = stateFor(jobId);
    final next = [
      for (final r in current.records)
        if (r.id == record.id) record else r,
    ];
    state = {...state, jobId: current.copyWith(records: next)};
  }
}

final evidenceProvider =
    NotifierProvider<EvidenceNotifier, Map<String, EvidenceState>>(
  EvidenceNotifier.new,
);