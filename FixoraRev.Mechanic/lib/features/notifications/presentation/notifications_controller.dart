import 'package:flutter/foundation.dart';

class AppNotification {
  const AppNotification({
    required this.id,
    required this.title,
    required this.body,
    this.read = false,
  });

  final String id;
  final String title;
  final String body;
  final bool read;

  AppNotification copyWith({bool? read}) => AppNotification(
        id: id,
        title: title,
        body: body,
        read: read ?? this.read,
      );
}

class NotificationsController extends ChangeNotifier {
  final List<AppNotification> _items = [
    const AppNotification(
      id: 'n1',
      title: 'Job A18 assigned',
      body: 'Honda City oil service is in your queue.',
    ),
    const AppNotification(
      id: 'n2',
      title: 'Customer approved',
      body: 'Creta AC diagnosis proposal was approved.',
      read: true,
    ),
  ];

  List<AppNotification> get all => List.unmodifiable(_items);

  int get unread => _items.where((n) => !n.read).length;

  void markAllRead() {
    for (var i = 0; i < _items.length; i++) {
      _items[i] = _items[i].copyWith(read: true);
    }
    notifyListeners();
  }

  void markRead(String id) {
    final i = _items.indexWhere((n) => n.id == id);
    if (i < 0) return;
    _items[i] = _items[i].copyWith(read: true);
    notifyListeners();
  }
}
