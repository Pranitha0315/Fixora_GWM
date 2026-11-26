import 'package:flutter/material.dart';

enum NotificationKind { job, approval, parts, sos, queue, passport }

class AppNotification {
  AppNotification({
    required this.kind,
    required this.title,
    required this.body,
    required this.time,
    this.read = false,
    this.jobId,
    this.remoteId,
    this.remoteType,
    this.entityId,
  });

  /// Backend notification id, type (e.g. change.forwarded) and entity id; null for demo data.
  final String? remoteId;
  final String? remoteType;
  final String? entityId;

  final NotificationKind kind;
  final String title;
  final String body;
  final DateTime time;
  bool read;
  final String? jobId;

  IconData get icon => switch (kind) {
        NotificationKind.job => Icons.assignment_outlined,
        NotificationKind.approval => Icons.thumb_up_alt_outlined,
        NotificationKind.parts => Icons.inventory_2_outlined,
        NotificationKind.sos => Icons.sos_rounded,
        NotificationKind.queue => Icons.low_priority_rounded,
        NotificationKind.passport => Icons.menu_book_outlined,
      };
}
