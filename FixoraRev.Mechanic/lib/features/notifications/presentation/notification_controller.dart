import 'package:flutter/foundation.dart';

import '../domain/app_notification.dart';
import '../../../core/backend/mechanic_backend.dart';

class NotificationController extends ChangeNotifier {
  NotificationController(this._items);

  final List<AppNotification> _items;

  List<AppNotification> get items =>
      List.of(_items)..sort((a, b) => b.time.compareTo(a.time));

  int get unread => _items.where((n) => !n.read).length;

  void add(AppNotification n) {
    _items.add(n);
    notifyListeners();
  }

  void markRead(AppNotification n) {
    n.read = true;
    MechanicBackend.instance.markRead(n.remoteId);
    notifyListeners();
  }

  void replaceAll(List<AppNotification> list) {
    _items
      ..clear()
      ..addAll(list);
    notifyListeners();
  }

  void markAllRead() {
    for (final n in _items) {
      n.read = true;
    }
    notifyListeners();
  }
}
