/// FixProof report state for one job.
enum ReportState { notStarted, draft, published }

extension ReportStateX on ReportState {
  String get label {
    switch (this) {
      case ReportState.notStarted:
        return 'Not started';
      case ReportState.draft:
        return 'AI draft ready · needs your check';
      case ReportState.published:
        return 'Published to customer';
    }
  }
}
