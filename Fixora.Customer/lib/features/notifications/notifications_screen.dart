import 'package:flutter/material.dart';

import '../../core/core.dart';
import '../bookings/book_service_screen.dart';
import '../bookings/live_queue_screen.dart';
import '../job/screens/invoice_screen.dart';
import '../job/screens/job_tracker_screen.dart';
import '../job/screens/repair_progress_screen.dart';
import '../job/screens/service_completed_screen.dart';
import '../job/screens/view_photos_screen.dart';
import '../plans/offers_plans_screen.dart';
import '../vehicles/vehicle_detail_screen.dart';

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
      case NotificationKind.estimate:
      case NotificationKind.received:
        context.push(const JobTrackerScreen());
      case NotificationKind.progress:
        context.push(const RepairProgressScreen());
      case NotificationKind.completed:
        context.push(const ServiceCompletedScreen());
      case NotificationKind.media:
        context.push(const ViewPhotosScreen());
      case NotificationKind.payment:
        context.push(const InvoiceScreen());
      case NotificationKind.queue:
        context.push(const LiveQueueScreen());
      case NotificationKind.booking:
        NavController.goToTab(context, 1);
      case NotificationKind.serviceDue:
        context.push(const BookServiceScreen(vehicleId: 'v1', service: 'General Service'));
      case NotificationKind.reminder:
        context.push(VehicleDetailScreen(vehicleId: AppState.instance.selectedVehicle.id));
      case NotificationKind.offer:
        context.push(const OffersPlansScreen());
      case NotificationKind.subscription:
        context.push(const OffersPlansScreen(initialTab: 1));
      case NotificationKind.sos:
        break;
    }
  }

  String _ago(DateTime t) {
    final now = DateTime.now();
    final d = now.difference(t);
    if (d.inMinutes < 1) return 'Just now';
    if (d.inMinutes < 60) return '${d.inMinutes} min ago';
    final today = DateTime(now.year, now.month, now.day);
    if (!t.isBefore(today)) return 'Today, ${time12(t)}';
    if (!t.isBefore(today.subtract(const Duration(days: 1)))) return 'Yesterday';
    final days = today.difference(DateTime(t.year, t.month, t.day)).inDays;
    if (days < 7) return '$days days ago';
    return dayMonthYear(t);
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
        return FxPage(
          title: 'Notifications',
          subtitle: 'Stay updated with your vehicle and service alerts',
          headerIcon: Icons.notifications_none_rounded,
          headerBadge: unread > 0,
          showBack: false,
          children: [
            FxPillTabs(
              labels: const ['All', 'Unread', 'Service', 'Offer'],
              index: _tab,
              onChanged: (i) => setState(() => _tab = i),
            ),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                onPressed: unread == 0
                    ? null
                    : () {
                        store.markAllRead();
                        showFxSnack(context, 'All notifications marked as read', icon: Icons.done_all_rounded);
                      },
                icon: const Icon(Icons.done_all_rounded, size: 19),
                label: const Text('Mark all as read', style: TextStyle(fontWeight: FontWeight.w600)),
              ),
            ),
            if (list.isEmpty)
              EmptyState(
                icon: _tab == 1 ? Icons.mark_email_read_outlined : Icons.notifications_off_outlined,
                title: _tab == 1 ? 'You are all caught up' : 'No notifications here',
                message: _tab == 3 ? 'New offers will appear here.' : 'Service updates will appear here.',
              ),
            for (var i = 0; i < list.length; i++)
              FadeSlide(
                index: i,
                child: Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Dismissible(
                    key: ValueKey(list[i].id),
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
                      final removed = list[i];
                      store.remove(removed.id);
                      ScaffoldMessenger.of(context)
                        ..hideCurrentSnackBar()
                        ..showSnackBar(SnackBar(
                          behavior: SnackBarBehavior.floating,
                          content: const Text('Notification deleted'),
                          action: SnackBarAction(
                            label: 'UNDO',
                            onPressed: () => store.push(removed),
                          ),
                        ));
                    },
                    child: _NotificationCard(
                      n: list[i],
                      icon: iconFor(list[i].kind),
                      time: _ago(list[i].time),
                      onTap: () => _open(context, list[i]),
                    ),
                  ),
                ),
              ),
            if (list.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text('Swipe left to delete a notification',
                    textAlign: TextAlign.center, style: AppText.small.copyWith(color: AppColors.textFaint)),
              ),
          ],
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
  const _NotificationCard({required this.n, required this.icon, required this.time, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final green = n.kind == NotificationKind.completed;
    return FxCard(
      padding: const EdgeInsets.fromLTRB(10, 12, 10, 12),
      radius: 20,
      onTap: onTap,
      shadow: n.unread,
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
          Container(width: 1.2, height: 42, margin: const EdgeInsets.symmetric(horizontal: 10), color: AppColors.border),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(n.title,
                          style: TextStyle(
                            fontSize: 15,
                            fontWeight: n.unread ? FontWeight.w800 : FontWeight.w700,
                            color: AppColors.navy,
                          )),
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
    );
  }
}

