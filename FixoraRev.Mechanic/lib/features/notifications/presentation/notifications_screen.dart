import 'package:flutter/material.dart';

import '../../../app/theme/app_colors.dart';
import '../../../core/di/app_services.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/utils/nav.dart';
import '../../../core/widgets/action_sheet.dart';
import '../../../core/widgets/rev_common.dart' show EmptyState;
import '../../../core/widgets/rev_ui.dart';
import '../../jobs/presentation/screens/job_detail_screen.dart';
import '../../sos/presentation/sos_screen.dart';
import '../domain/app_notification.dart';
import '../../../core/backend/api_client.dart';
import '../../../core/backend/mechanic_backend.dart';

/// Alerts tab — filter chips, Today / Earlier, unread dots.
class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key, this.asTab = false});

  final bool asTab;

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  int _filter = 0;

  static const _filters = <(String, Set<NotificationKind>?)>[
    ('All', null),
    ('Jobs', {NotificationKind.job, NotificationKind.queue}),
    ('Approvals', {NotificationKind.approval}),
    ('SOS', {NotificationKind.sos}),
  ];

  static RevTone toneFor(NotificationKind k) => switch (k) {
        NotificationKind.sos => RevTone.red,
        NotificationKind.approval => RevTone.green,
        NotificationKind.queue => RevTone.blue,
        NotificationKind.job => RevTone.orange,
      };

  /// Customer → manager → mechanic: a change the manager forwarded. The mechanic confirms it is handled.
  Future<void> _acknowledgeChange(AppNotification n) async {
    final note = TextEditingController();
    // Bottom sheet instead of a centred dialog: the note field and the buttons sit in the thumb zone.
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(20, 0, 20, 20 + MediaQuery.viewInsetsOf(ctx).bottom),
        child: SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(n.title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
              const SizedBox(height: 6),
              Text(n.body, style: const TextStyle(height: 1.4)),
              const SizedBox(height: 14),
              TextField(controller: note, decoration: const InputDecoration(hintText: 'Note to manager (optional)')),
              const SizedBox(height: 16),
              FilledButton.icon(
                onPressed: () => Navigator.of(ctx).pop(true),
                icon: const Icon(Icons.check_rounded),
                label: const Text('Acknowledge'),
              ),
              TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Later')),
            ],
          ),
        ),
      ),
    );
    if (ok != true || !mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    try {
      await MechanicBackend.instance.acknowledgeChange(n.entityId!, note: note.text.trim());
      messenger.showSnackBar(const SnackBar(content: Text('Acknowledged. The manager and customer were told.')));
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  void _open(AppNotification n) {
    AppServices.notifications.markRead(n);
    if (n.remoteType == 'change.forwarded' && n.entityId != null) {
      _acknowledgeChange(n);
      return;
    }
    if (n.jobId != null && AppServices.jobs.tryById(n.jobId!) == null) return;
    switch (n.kind) {
      case NotificationKind.sos:
        final open = AppServices.sos.open;
        if (open.isNotEmpty) context.push(SosDetailScreen(requestId: open.first.id));
      default:
        if (n.jobId != null) context.push(JobDetailScreen(jobId: n.jobId!));
    }
  }

  /// Swipe right = mark read (the card stays); long-press = options sheet.
  Widget _swipeable(AppNotification n) {
    final card = GestureDetector(
      onLongPress: () => showActionSheet(
        context,
        title: n.title,
        subtitle: Fmt.ago(n.time),
        actions: [
          SheetAction(icon: Icons.open_in_new_rounded, label: 'Open', onTap: () => _open(n)),
          if (!n.read)
            SheetAction(
              icon: Icons.mark_email_read_outlined,
              label: 'Mark as read',
              onTap: () => AppServices.notifications.markRead(n),
            ),
        ],
      ),
      child: _AlertCard(n: n, tone: toneFor(n.kind), onTap: () => _open(n)),
    );
    if (n.read) return card;
    return Dismissible(
      key: ObjectKey(n),
      direction: DismissDirection.startToEnd,
      confirmDismiss: (_) async {
        AppServices.notifications.markRead(n);
        return false;
      },
      background: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.only(left: 20),
        alignment: Alignment.centerLeft,
        decoration: BoxDecoration(color: AppColors.primarySoft, borderRadius: BorderRadius.circular(20)),
        child: Row(
          children: [
            Icon(Icons.mark_email_read_outlined, color: AppColors.primaryStrong),
            const SizedBox(width: 8),
            Text('Mark read', style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.primaryStrong)),
          ],
        ),
      ),
      child: card,
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: AppServices.notifications,
      builder: (context, _) {
        final ctrl = AppServices.notifications;
        final kinds = _filters[_filter].$2;
        final items = ctrl.items.where((n) => kinds == null || kinds.contains(n.kind)).toList();
        final now = DateTime.now();
        final today = items
            .where((n) => n.time.year == now.year && n.time.month == now.month && n.time.day == now.day)
            .toList();
        final earlier = items.where((n) => !today.contains(n)).toList();
        final unread = ctrl.unread;

        final page = RevTabPage(
          title: 'Alerts',
          subtitle: unread == 0
              ? 'You’re all caught up'
              : 'You have $unread unread update${unread == 1 ? '' : 's'}',
          action: widget.asTab
              ? null
              : IconButton(
                  tooltip: 'Close',
                  onPressed: () => Navigator.of(context).maybePop(),
                  icon: Icon(Icons.close_rounded, color: AppColors.body),
                ),
          children: [
            const SizedBox(height: 16),
            RevChipRow(
              labels: [for (final f in _filters) f.$1],
              selected: _filter,
              onSelected: (i) => setState(() => _filter = i),
            ),
            if (items.isEmpty)
              _filter != 0
                  ? EmptyState(
                      icon: Icons.notifications_off_outlined,
                      title: 'No ${_filters[_filter].$1.toLowerCase()} alerts',
                      message: 'Nothing of this kind right now. Other alerts may be waiting.',
                      actionLabel: 'Show all alerts',
                      actionIcon: Icons.filter_alt_off_rounded,
                      onAction: () => setState(() => _filter = 0),
                    )
                  : EmptyState(
                      icon: Icons.notifications_none_rounded,
                      title: 'You’re all caught up',
                      message: 'Approvals, parts and SOS calls appear here the moment they happen.',
                      actionLabel: 'Back to my jobs',
                      actionIcon: Icons.handyman_outlined,
                      onAction: () => Navigator.of(context).maybePop(),
                    ),
            if (today.isNotEmpty) ...[
              RevSection(
                'Today',
                top: 18,
                action: unread > 0 ? 'Mark all read' : null,
                onAction: ctrl.markAllRead,
              ),
              for (final n in today) _swipeable(n),
            ],
            if (earlier.isNotEmpty) ...[
              RevSection(
                'Earlier',
                top: today.isEmpty ? 18 : 14,
                action: today.isEmpty && unread > 0 ? 'Mark all read' : null,
                onAction: ctrl.markAllRead,
              ),
              for (final n in earlier) _swipeable(n),
            ],
            if (items.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text('Swipe right to mark read · press and hold for options.',
                  textAlign: TextAlign.center, style: TextStyle(fontSize: 12.5, color: AppColors.muted)),
            ],
          ],
        );
        final refreshable = RefreshIndicator(
          color: AppColors.primaryStrong,
          edgeOffset: MediaQuery.paddingOf(context).top,
          onRefresh: MechanicBackend.instance.pullRefresh,
          child: page,
        );
        return widget.asTab ? refreshable : Scaffold(body: refreshable);
      },
    );
  }
}

class _AlertCard extends StatelessWidget {
  const _AlertCard({required this.n, required this.tone, required this.onTap});

  final AppNotification n;
  final RevTone tone;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final dark = AppColors.isDark;
    final unread = !n.read;
    return RevCard(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
      color: unread ? (dark ? const Color(0xFF1F1712) : const Color(0xFFFFFBF8)) : null,
      borderColor: unread ? (dark ? const Color(0xFF5A3418) : AppColors.primaryBorder) : null,
      onTap: onTap,
      semanticLabel: '${unread ? 'Unread. ' : ''}${n.title}. ${n.body}. ${Fmt.ago(n.time)}',
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ToneIcon(icon: n.icon, tone: tone, size: 42),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(n.title, style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700, color: AppColors.ink)),
                const SizedBox(height: 2),
                Text(n.body, style: TextStyle(fontSize: 13.5, color: AppColors.body, height: 1.35)),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(Fmt.ago(n.time), style: TextStyle(fontSize: 12.5, color: AppColors.muted)),
              if (unread) ...[
                const SizedBox(height: 10),
                Container(
                  width: 9,
                  height: 9,
                  decoration: BoxDecoration(color: AppColors.primary, shape: BoxShape.circle),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}
