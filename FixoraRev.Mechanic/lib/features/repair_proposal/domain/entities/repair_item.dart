enum RepairItemType { part, labour }

enum ApprovalDecision { notSent, pending, approved, declined }

extension ApprovalDecisionX on ApprovalDecision {
  String get label {
    switch (this) {
      case ApprovalDecision.notSent:
        return 'Not sent';
      case ApprovalDecision.pending:
        return 'Waiting';
      case ApprovalDecision.approved:
        return 'Approved';
      case ApprovalDecision.declined:
        return 'Declined';
    }
  }
}

class RepairItem {
  const RepairItem({
    required this.id,
    required this.title,
    required this.type,
    required this.price,
    required this.decision,
    this.linkedIssue,
  });

  final String id;
  final String title;
  final RepairItemType type;
  final int price; // LKR
  final ApprovalDecision decision;
  final String? linkedIssue;

  RepairItem copyWith({ApprovalDecision? decision}) {
    return RepairItem(
      id: id,
      title: title,
      type: type,
      price: price,
      decision: decision ?? this.decision,
      linkedIssue: linkedIssue,
    );
  }
}
