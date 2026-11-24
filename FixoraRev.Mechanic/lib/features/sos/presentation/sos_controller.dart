import 'package:flutter/foundation.dart';

class SosController extends ChangeNotifier {
  final List<String> _open = [];

  List<String> get open => List.unmodifiable(_open);

  void seedDemo() {
    // Empty by default — home can show 0 open SOS.
  }
}
