import 'package:flutter_riverpod/flutter_riverpod.dart';

class CaptureState {
  const CaptureState({this.count = 0});

  final int count;

  CaptureState copyWith({int? count}) => CaptureState(count: count ?? this.count);
}

class CaptureNotifier extends Notifier<CaptureState> {
  @override
  CaptureState build() => const CaptureState();

  void increment() => state = state.copyWith(count: state.count + 1);

  void reset() => state = const CaptureState();
}

final captureProvider =
    NotifierProvider<CaptureNotifier, CaptureState>(CaptureNotifier.new);
