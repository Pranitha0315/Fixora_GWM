import 'package:flutter/material.dart';

import '../../core/navigation/nav.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../data/models/models.dart';
import '../../data/repositories/job_store.dart';
import '../bookings/live_queue_screen.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  int _tab = 0;

  static IconData iconFor(NotificationKind k) {
    switch (k) {
      case NotificationKind.estimate:
        return Icons.receipt_long_outlined;
      case NotificationKind.progress:
        return Icons.car_repair_outlined;
      case NotificationKind.media:
        return Icons.photo_library_outlined;
      case NotificationKind.payment:
        return Icons.payments_outlined;
      case NotificationKind.reminder:
        return Icons.event_repeat_outlined;
      case NotificationKind.queue:
        return Icons.format_list_numbered_rounded;
      case NotificationKind.sos:
        return Icons.sos_rounded;
      case NotificationKind.booking:
        return Icons.calendar_month_outlined;
      case NotificationKind.received:
        return Icons.directions_car_outlined;
      case NotificationKind.completed:
        return Icons.check_circle_outline_rounded;
      case NotificationKind.serviceDue:
        return Icons.build_outlined;
      case NotificationKind.offer:
        return Icons.local_offer_outlined;
      case NotificationKind.subscription:
        return Icons.workspace_premium_outlined;
    }
  }

  void _open(BuildContext context, AppNotification n) {
    JobStore.instance.markRead(n.id);
    switch (n.kind) {
      case NotificationKind.queue:
        context.push(const LiveQueueScreen());
      case NotificationKind.booking:
        NavController.goToTab(context, 1);
      case NotificationKind.estimate:
      case NotificationKind.progress:
      case NotificationKind.media:
      case NotificationKind.payment:
      case NotificationKind.reminder:
      case NotificationKind.sos:
      case NotificationKind.received:
      case NotificationKind.completed:
      case NotificationKind.serviceDue:
      case NotificationKind.offer:
      case NotificationKind.subscription:
        break;
    }
  }

  String _ago(DateTime t) {
    final now = DateTime.now();
    final d = now.difference(t);
    if (d.inMinutes < 1) return 'Just now';
    if (d.inMinutes < 60) return '${d.inMinutes} min ago';
    final today = DateTime(now.year, now.month, now.day);
    if (!t.isBefore(today)) {
      final h = t.hour % 12 == 0 ? 12 : t.hour % 12;
      final m = t.minute.toString().padLeft(2, '0');
      final ap = t.hour >= 12 ? 'PM' : 'AM';
      return 'Today, $h:$m $ap';
    }
    if (!t.isBefore(today.subtract(const Duration(days: 1)))) return 'Yesterday';
    final days = today.difference(DateTime(t.year, t.month, t.day)).inDays;
    if (days < 7) return '$days days ago';
    return '${t.day}/${t.month}/${t.year}';
  }

  @override
  Widget build(BuildContext context) {
    final store = JobStore.instance;
    return ListenableBuilder(
      listenable: store,
      builder: (context, _) {
        final all = store.notifications;
        final list = switch (_tab) {
          1 => all.where((n) => n.unread).toList(),
          2 => all.where((n) => !n.isOffer).toList(),
          3 => all.where((n) => n.isOffer).toList(),
          _ => all,
        };
        final unread = store.unreadCount;
        return Scaffold(
          backgroundColor: AppColors.bg,
          appBar: AppBar(
            title: const Text('Notifications'),
            backgroundColor: AppColors.bg,
            foregroundColor: AppColors.navy,
            elevation: 0,
            actions: [
              if (unread > 0)
                TextButton(
                  onPressed: store.markAllRead,
                  child: const Text('Mark all read'),
                ),
            ],
          ),
          body: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                child: Text(
                  'Stay updated with your vehicle and service alerts',
                  style: AppText.muted,
                ),
              ),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Row(
                  children: [
                    for (final e in const [
                      (0, 'All'),
                      (1, 'Unread'),
                      (2, 'Service'),
                      (3, 'Offer'),
                    ])
                      Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: ChoiceChip(
                          label: Text(e.$2),
                          selected: _tab == e.$1,
                          onSelected: (_) => setState(() => _tab = e.$1),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              Expanded(
                child: list.isEmpty
                    ? Center(
                        child: Text(
                          _tab == 1 ? 'You are all caught up' : 'No notifications here',
                          style: AppText.muted,
                        ),
                      )
                    : ListView.builder(
                        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                        itemCount: list.length,
                        itemBuilder: (context, i) {
                          final n = list[i];
                          return Padding(
                            padding: const EdgeInsets.only(bottom: 10),
                            child: Dismissible(
                              key: ValueKey(n.id),
                              direction: DismissDirection.endToStart,
                              background: Container(
                                alignment: Alignment.centerRight,
                                padding: const EdgeInsets.only(right: 22),
                                decoration: BoxDecoration(
                                  color: AppColors.dangerSoft,
                                  borderRadius: BorderRadius.circular(20),
                                ),
                                child: const Icon(Icons.delete_outline_rounded, color: AppColors.danger),
                              ),
                              onDismissed: (_) {
                                store.remove(n.id);
                                ScaffoldMessenger.of(context)
                                  ..hideCurrentSnackBar()
                                  ..showSnackBar(
                                    SnackBar(
                                      behavior: SnackBarBehavior.floating,
                                      content: const Text('Notification deleted'),
                                      action: SnackBarAction(
                                        label: 'UNDO',
                                        onPressed: () => store.push(n),
                                      ),
                                    ),
                                  );
                              },
                              child: _NotificationCard(
                                n: n,
                                icon: iconFor(n.kind),
                                time: _ago(n.time),
                                onTap: () => _open(context, n),
                              ),
                            ),
                          );
                        },
                      ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _NotificationCard extends StatelessWidget {
  final AppNotification n;
  final IconData icon;
  final String time;
  final VoidCallback onTap;
  const _NotificationCard({
    required this.n,
    required this.icon,
    required this.time,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final green = n.kind == NotificationKind.completed;
    return Material(
      color: AppColors.surfaceSolid,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.fromLTRB(10, 12, 10, 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: AppColors.border),
            boxShadow: n.unread ? AppColors.float : null,
          ),
          child: Row(
            children: [
              SizedBox(
                width: 12,
                child: n.unread
                    ? Container(
                        width: 8,
                        height: 8,
                        decoration: const BoxDecoration(color: AppColors.primary, shape: BoxShape.circle),
                      )
                    : null,
              ),
              Container(
                width: 50,
                height: 50,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: green ? AppColors.successSoft : AppColors.primarySoft,
                ),
                child: Icon(icon, color: green ? AppColors.success : AppColors.primary, size: 26),
              ),
              Container(
                width: 1.2,
                height: 42,
                margin: const EdgeInsets.symmetric(horizontal: 10),
                color: AppColors.border,
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Text(
                            n.title,
                            style: TextStyle(
                              fontSize: 15,
                              fontWeight: n.unread ? FontWeight.w800 : FontWeight.w700,
                              color: AppColors.navy,
                            ),
                          ),
                        ),
                        const SizedBox(width: 6),
                        Text(time, style: AppText.small.copyWith(fontSize: 11)),
                      ],
                    ),
                    const SizedBox(height: 3),
                    Text(n.body, style: AppText.muted.copyWith(fontSize: 13, color: AppColors.text)),
                  ],
                ),
              ),
              const SizedBox(width: 4),
              Icon(Icons.chevron_right_rounded, color: AppColors.navy),
            ],
          ),
        ),
      ),
    );
  }
}
