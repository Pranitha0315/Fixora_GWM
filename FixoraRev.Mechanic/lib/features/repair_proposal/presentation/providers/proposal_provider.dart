import 'package:flutter_riverpod/flutter_riverpod.dart';

class ProposalState {
  const ProposalState({this.draftCount = 0});

  final int draftCount;

  ProposalState copyWith({int? draftCount}) =>
      ProposalState(draftCount: draftCount ?? this.draftCount);
}

class ProposalNotifier extends Notifier<ProposalState> {
  @override
  ProposalState build() => const ProposalState();

  void addDraft() => state = state.copyWith(draftCount: state.draftCount + 1);
}

final proposalProvider =
    NotifierProvider<ProposalNotifier, ProposalState>(ProposalNotifier.new);
