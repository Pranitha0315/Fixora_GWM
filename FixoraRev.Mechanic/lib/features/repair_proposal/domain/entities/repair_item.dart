enum ApprovalDecision { notSent, pending, approved, declined }

extension ApprovalDecisionX on ApprovalDecision {
  String get label => switch (this) {
        ApprovalDecision.notSent => 'Not sent',
        ApprovalDecision.pending => 'Pending',
        ApprovalDecision.approved => 'Approved',
        ApprovalDecision.declined => 'Declined',
      };
}

class RepairItem {
  RepairItem({
    required this.title,
    required this.type,
    required this.price,
    this.decision = ApprovalDecision.notSent,
    String? id,
  }) : id = id ?? DateTime.now().millisecondsSinceEpoch.toString();

  final String id;
  String title;
  String type;
  double price;
  ApprovalDecision decision;

  RepairItem copyWith({
    String? title,
    String? type,
    double? price,
    ApprovalDecision? decision,
  }) {
    return RepairItem(
      id: id,
      title: title ?? this.title,
      type: type ?? this.type,
      price: price ?? this.price,
      decision: decision ?? this.decision,
    );
  }
}