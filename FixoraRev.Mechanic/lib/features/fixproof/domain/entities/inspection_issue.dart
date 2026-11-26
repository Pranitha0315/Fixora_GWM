enum IssueSeverity { critical, soon, ok }

extension IssueSeverityX on IssueSeverity {
  String get label {
    switch (this) {
      case IssueSeverity.critical:
        return 'Fix now';
      case IssueSeverity.soon:
        return 'Fix soon';
      case IssueSeverity.ok:
        return 'Good';
    }
  }

  String get labelTa {
    switch (this) {
      case IssueSeverity.critical:
        return 'உடனே சரிசெய்';
      case IssueSeverity.soon:
        return 'விரைவில்';
      case IssueSeverity.ok:
        return 'நன்று';
    }
  }
}

/// One finding in an AI-drafted FixProof report.
/// The mechanic must verify every issue before the report can be published.
class InspectionIssue {
  const InspectionIssue({
    required this.id,
    required this.area,
    required this.title,
    required this.titleTa,
    required this.detail,
    required this.detailTa,
    required this.severity,
    required this.evidenceLabels,
    this.verified = false,
  });

  final String id;
  final String area;
  final String title;
  final String titleTa;
  final String detail;
  final String detailTa;
  final IssueSeverity severity;
  final List<String> evidenceLabels;
  final bool verified;

  InspectionIssue copyWith({
    String? area,
    String? title,
    String? titleTa,
    String? detail,
    String? detailTa,
    IssueSeverity? severity,
    List<String>? evidenceLabels,
    bool? verified,
  }) {
    return InspectionIssue(
      id: id,
      area: area ?? this.area,
      title: title ?? this.title,
      titleTa: titleTa ?? this.titleTa,
      detail: detail ?? this.detail,
      detailTa: detailTa ?? this.detailTa,
      severity: severity ?? this.severity,
      evidenceLabels: evidenceLabels ?? this.evidenceLabels,
      verified: verified ?? this.verified,
    );
  }
}
