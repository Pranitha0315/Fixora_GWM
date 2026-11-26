import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/mock/mock_data.dart';
import '../../domain/entities/inspection_issue.dart';
import '../../domain/entities/report_state.dart';

export '../../domain/entities/report_state.dart';

/// Capture state for one FixProof inspection session.
class CaptureState {
  const CaptureState({
    required this.media,
    required this.voiceNotes,
    required this.areas,
  });

  final List<CapturedMedia> media;
  final List<VoiceNote> voiceNotes;
  final Set<String> areas;

  bool get canGenerate => media.isNotEmpty && voiceNotes.isNotEmpty;

  CaptureState copyWith({
    List<CapturedMedia>? media,
    List<VoiceNote>? voiceNotes,
    Set<String>? areas,
  }) {
    return CaptureState(
      media: media ?? this.media,
      voiceNotes: voiceNotes ?? this.voiceNotes,
      areas: areas ?? this.areas,
    );
  }
}

class CapturedMedia {
  const CapturedMedia({required this.id, required this.label, required this.isVideo});
  final String id;
  final String label;
  final bool isVideo;
}

class VoiceNote {
  const VoiceNote({required this.id, required this.seconds});
  final String id;
  final int seconds;

  String get duration {
    final m = (seconds ~/ 60).toString();
    final s = (seconds % 60).toString().padLeft(2, '0');
    return '$m:$s';
  }
}

class CaptureNotifier extends Notifier<CaptureState> {
  int _counter = 3;

  @override
  CaptureState build() => const CaptureState(
        media: [
          CapturedMedia(id: 'm1', label: 'Front-left pad', isVideo: false),
          CapturedMedia(id: 'm2', label: 'Disc surface', isVideo: false),
          CapturedMedia(id: 'm3', label: 'Brake test', isVideo: true),
        ],
        voiceNotes: [],
        areas: {'Brakes'},
      );

  void addMedia({required bool isVideo}) {
    _counter++;
    final label = isVideo ? 'Video $_counter' : 'Photo $_counter';
    state = state.copyWith(
      media: [...state.media, CapturedMedia(id: 'm$_counter', label: label, isVideo: isVideo)],
    );
  }

  void removeMedia(String id) {
    state = state.copyWith(media: state.media.where((m) => m.id != id).toList());
  }

  void addVoiceNote(int seconds) {
    _counter++;
    state = state.copyWith(
      voiceNotes: [...state.voiceNotes, VoiceNote(id: 'v$_counter', seconds: seconds)],
    );
  }

  void removeVoiceNote(String id) {
    state = state.copyWith(voiceNotes: state.voiceNotes.where((v) => v.id != id).toList());
  }

  void toggleArea(String area) {
    final next = Set<String>.from(state.areas);
    if (!next.remove(area)) next.add(area);
    state = state.copyWith(areas: next);
  }

  void reset() => state = build();
}

final captureProvider = NotifierProvider<CaptureNotifier, CaptureState>(CaptureNotifier.new);

/// AI-drafted issues the mechanic reviews, edits and verifies.
class ReportDraftNotifier extends Notifier<List<InspectionIssue>> {
  @override
  List<InspectionIssue> build() => List<InspectionIssue>.from(MockData.issues);

  void toggleVerified(String id) {
    state = [
      for (final i in state) i.id == id ? i.copyWith(verified: !i.verified) : i,
    ];
  }

  void updateDetail(String id, {required bool tamil, required String text}) {
    state = [
      for (final i in state)
        i.id == id
            ? (tamil
                ? i.copyWith(detailTa: text, verified: false)
                : i.copyWith(detail: text, verified: false))
            : i,
    ];
  }

  void remove(String id) {
    state = state.where((i) => i.id != id).toList();
  }

  /// Manual fallback when AI draft is empty or the mechanic adds an extra finding.
  void addManual({
    required String area,
    required String title,
    required String detail,
    required IssueSeverity severity,
  }) {
    final id = 'manual-${DateTime.now().millisecondsSinceEpoch}';
    state = [
      ...state,
      InspectionIssue(
        id: id,
        area: area,
        title: title,
        titleTa: title,
        detail: detail,
        detailTa: detail,
        severity: severity,
        evidenceLabels: const [],
        verified: false,
      ),
    ];
  }
}

final reportDraftProvider =
    NotifierProvider<ReportDraftNotifier, List<InspectionIssue>>(ReportDraftNotifier.new);

/// true = show report in Tamil.
final reportTamilProvider = StateProvider<bool>((ref) => true);

/// FixProof report state per job id.
class ReportStateNotifier extends Notifier<Map<String, ReportState>> {
  @override
  Map<String, ReportState> build() => {
        for (final e in MockData.reportStates.entries)
          e.key: ReportState.values.firstWhere((s) => s.name == e.value),
      };

  ReportState of(String jobId) => state[jobId] ?? ReportState.notStarted;

  void set(String jobId, ReportState value) => state = {...state, jobId: value};
}

final reportStateProvider =
    NotifierProvider<ReportStateNotifier, Map<String, ReportState>>(ReportStateNotifier.new);
