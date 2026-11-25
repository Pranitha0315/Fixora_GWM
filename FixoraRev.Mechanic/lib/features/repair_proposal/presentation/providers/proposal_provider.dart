import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/di/app_services.dart';
import '../../domain/entities/repair_item.dart';
import '../../../jobs/domain/job_entities.dart';

class ProposalState {
  const ProposalState({this.items = const []});

  final List<RepairItem> items;

  ProposalState copyWith({List<RepairItem>? items}) =>
      ProposalState(items: items ?? this.items);

  double get total => items.fold(0, (sum, i) => sum + i.price);
}

class ProposalNotifier extends Notifier<Map<String, ProposalState>> {
  @override
  Map<String, ProposalState> build() => {};

  ProposalState stateFor(String jobId) =>
      state[jobId] ?? const ProposalState();

  void add(String jobId, RepairItem item) {
    final current = stateFor(jobId);
    state = {
      ...state,
      jobId: current.copyWith(items: [...current.items, item]),
    };
  }

  void update(String jobId, RepairItem item) {
    final current = stateFor(jobId);
    final next = [
      for (final i in current.items)
        if (i.id == item.id) item else i,
    ];
    state = {...state, jobId: current.copyWith(items: next)};
  }

  void remove(String jobId, String itemId) {
    final current = stateFor(jobId);
    state = {
      ...state,
      jobId: current.copyWith(
        items: current.items.where((i) => i.id != itemId).toList(),
      ),
    };
  }

  void sendForApproval(String jobId) {
    final current = stateFor(jobId);
    final next = [
      for (final i in current.items)
        i.copyWith(decision: ApprovalDecision.pending),
    ];
    state = {...state, jobId: current.copyWith(items: next)};

    final job = AppServices.jobs.byId(jobId);
    if (job != null) {
      AppServices.jobs.setStatus(jobId, JobStatus.awaitingApproval);
      job.log(
        'Repair proposal sent',
        detail: '${next.length} line items',
      );
    }
  }
}

final proposalProvider =
    NotifierProvider<ProposalNotifier, Map<String, ProposalState>>(
  ProposalNotifier.new,
);