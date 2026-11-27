import 'package:flutter/foundation.dart';

import '../domain/app_notification.dart';
import '../../../core/backend/mechanic_backend.dart';

class NotificationController extends ChangeNotifier {
  NotificationController(this._items);

  final List<AppNotification> _items;

  /// Unread total from GET /notifications/unread-count (null until the server answered, or in demo mode).
  int? _serverUnread;

  List<AppNotification> get items =>
      List.of(_items)..sort((a, b) => b.time.compareTo(a.time));

  /// Bell badge: the server's count when known, otherwise counted from the loaded list.
  int get unread => _serverUnread ?? _items.where((n) => !n.read).length;

  void setServerUnread(int count) {
    _serverUnread = count < 0 ? 0 : count;
    notifyListeners();
  }

  void add(AppNotification n) {
    _items.add(n);
    if (_serverUnread != null && !n.read) _serverUnread = _serverUnread! + 1;
    notifyListeners();
  }

  void markRead(AppNotification n) {
    if (!n.read && _serverUnread != null && _serverUnread! > 0) _serverUnread = _serverUnread! - 1;
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

  /// Forgets the server count (used on sign-out so the next account starts clean).
  void clearServerUnread() {
    _serverUnread = null;
    notifyListeners();
  }

  void markAllRead() {
    for (final n in _items) {
      n.read = true;
    }
    if (_serverUnread != null) _serverUnread = 0;
    MechanicBackend.instance.markAllRead().catchError((Object _) {});
    notifyListeners();
  }
}
