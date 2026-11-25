import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../domain/inspection_issue.dart';

class CaptureState {
  const CaptureState({
    this.count = 0,
    this.issues = const [],
    this.aiDraft = '',
  });

  final int count;
  final List<InspectionIssue> issues;
  final String aiDraft;

  CaptureState copyWith({
    int? count,
    List<InspectionIssue>? issues,
    String? aiDraft,
  }) {
    return CaptureState(
      count: count ?? this.count,
      issues: issues ?? this.issues,
      aiDraft: aiDraft ?? this.aiDraft,
    );
  }
}

class CaptureNotifier extends Notifier<Map<String, CaptureState>> {
  @override
  Map<String, CaptureState> build() => {};

  CaptureState stateFor(String jobId) =>
      state[jobId] ?? const CaptureState();

  void increment(String jobId) {
    final current = stateFor(jobId);
    state = {
      ...state,
      jobId: current.copyWith(count: current.count + 1),
    };
  }

  void addManual(String jobId, InspectionIssue issue) {
    final current = stateFor(jobId);
    state = {
      ...state,
      jobId: current.copyWith(issues: [...current.issues, issue]),
    };
  }

  void removeIssue(String jobId, String issueId) {
    final current = stateFor(jobId);
    state = {
      ...state,
      jobId: current.copyWith(
        issues: current.issues.where((i) => i.id != issueId).toList(),
      ),
    };
  }

  void setAiDraft(String jobId, String draft) {
    final current = stateFor(jobId);
    state = {...state, jobId: current.copyWith(aiDraft: draft)};
  }

  void generateAiDraft(String jobId) {
    final current = stateFor(jobId);
    if (current.issues.isEmpty) {
      state = {
        ...state,
        jobId: current.copyWith(
          aiDraft: 'No issues logged yet. Add inspection findings to draft a report.',
        ),
      };
      return;
    }
    final buffer = StringBuffer('Inspection summary\n\n');
    for (final issue in current.issues) {
      buffer.writeln(
        '• ${componentLabel(issue.component)} — ${issue.title} '
        '(${issue.severity.label})',
      );
      if (issue.description.isNotEmpty) {
        buffer.writeln('  ${issue.description}');
      }
    }
    buffer.writeln('\nRecommended: review with customer before repair.');
    state = {...state, jobId: current.copyWith(aiDraft: buffer.toString())};
  }

  void clear(String jobId) {
    state = {...state, jobId: const CaptureState()};
  }
}

final captureProvider =
    NotifierProvider<CaptureNotifier, Map<String, CaptureState>>(
  CaptureNotifier.new,
);