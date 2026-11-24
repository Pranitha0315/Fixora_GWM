import 'package:flutter_riverpod/flutter_riverpod.dart';

class EvidenceState {
  const EvidenceState({this.items = const []});

  final List<String> items;

  EvidenceState copyWith({List<String>? items}) =>
      EvidenceState(items: items ?? this.items);
}

class EvidenceNotifier extends Notifier<EvidenceState> {
  @override
  EvidenceState build() => const EvidenceState();

  void add(String id) => state = state.copyWith(items: [...state.items, id]);
}

final evidenceProvider =
    NotifierProvider<EvidenceNotifier, EvidenceState>(EvidenceNotifier.new);
