import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../domain/entities/repair_item.dart';

/// Repair items per job id. Customer approves/declines each item
/// separately (Selective Repair Approval USP).
class ProposalNotifier extends Notifier<Map<String, List<RepairItem>>> {
  int _counter = 100;

  @override
  Map<String, List<RepairItem>> build() => {};

  List<RepairItem> itemsFor(String jobId) => state[jobId] ?? const [];

  void add(String jobId, {required String title, required int price, required RepairItemType type}) {
    _counter++;
    final item = RepairItem(
      id: 'r$_counter',
      title: title,
      type: type,
      price: price,
      decision: ApprovalDecision.notSent,
    );
    state = {...state, jobId: [...itemsFor(jobId), item]};
  }

  /// Backend copy of the latest proposal for a job (statuses masked by the server until the manager releases).
  /// Items added on the phone and not yet sent are kept.
  void applyRemote(String jobId, List<RepairItem> items) {
    final unsent = itemsFor(jobId).where((i) => i.decision == ApprovalDecision.notSent);
    state = {...state, jobId: [...items, ...unsent]};
  }

  /// Marks items as sent after the backend accepted them.
  void markSent(String jobId) {
    state = {
      ...state,
      jobId: itemsFor(jobId).where((i) => i.decision != ApprovalDecision.notSent).toList(),
    };
  }

  void remove(String jobId, String itemId) {
    state = {...state, jobId: itemsFor(jobId).where((i) => i.id != itemId).toList()};
  }

  /// Sends every "not sent" item to the customer for approval.
  int sendForApproval(String jobId) {
    var sent = 0;
    final updated = itemsFor(jobId).map((i) {
      if (i.decision == ApprovalDecision.notSent) {
        sent++;
        return i.copyWith(decision: ApprovalDecision.pending);
      }
      return i;
    }).toList();
    state = {...state, jobId: updated};
    return sent;
  }
}

final proposalProvider =
    NotifierProvider<ProposalNotifier, Map<String, List<RepairItem>>>(ProposalNotifier.new);
