import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../data/repositories/app_state.dart';

/// Live queue & explainable ETA.
class LiveQueueScreen extends StatefulWidget {
  final String? bookingId;
  const LiveQueueScreen({super.key, this.bookingId});

  @override
  State<LiveQueueScreen> createState() => _LiveQueueScreenState();
}

class _LiveQueueScreenState extends State<LiveQueueScreen> {
  HomeBooking? get _booking {
    final app = AppState.instance;
    if (widget.bookingId != null) {
      final found = app.bookings.where((e) => e.id == widget.bookingId);
      if (found.isNotEmpty) return found.first;
    }
    return app.nextUpcoming;
  }

  String _time12(DateTime d) {
    final h = d.hour % 12 == 0 ? 12 : d.hour % 12;
    final m = d.minute.toString().padLeft(2, '0');
    final ap = d.hour >= 12 ? 'PM' : 'AM';
    return '$h:$m $ap';
  }

  static const _weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  Future<void> _cancel(HomeBooking b) async {
    // confirm dialog → AppState.instance.cancelBooking(b.id)
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
        title: const Text('Cancel this booking?'),
        content: Text(
          '${b.service} on ${b.date.day}/${b.date.month}/${b.date.year} '
          'at ${_time12(b.date)} will be cancelled.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Keep')),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text('Cancel booking', style: TextStyle(color: AppColors.dangerText)),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    AppState.instance.cancelBooking(b.id);
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Booking cancelled'),
        behavior: SnackBarBehavior.floating,
      ),
    );
    setState(() {});
  }

  void _reschedule(HomeBooking b) {
    // pick new slot → AppState.instance.rescheduleBooking(b.id, newDate)
    final d = b.date;
    final options = <(String, DateTime, String)>[
      ('${_time12(d.add(const Duration(hours: 1)))} same day', d.add(const Duration(hours: 1)), 'Wait drops to ~5 min'),
      ('${_time12(d.add(const Duration(hours: 4)))} same day', d.add(const Duration(hours: 4)), 'No wait · mechanic free'),
      (
        '${_weekdays[d.add(const Duration(days: 1)).weekday - 1]} 08:30 AM',
        DateTime(d.year, d.month, d.day + 1, 8, 30),
        'First job of the day',
      ),
    ];
    var picked = 0;
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) => Container(
          margin: const EdgeInsets.all(12),
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(color: AppColors.surfaceSolid, borderRadius: BorderRadius.circular(26)),
          child: SafeArea(
            top: false,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Reschedule', style: AppText.h1),
                const SizedBox(height: 4),
                Text('See the impact before you move your slot.', style: AppText.muted),
                const SizedBox(height: 14),
                for (var i = 0; i < options.length; i++)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Material(
                      color: picked == i ? AppColors.primarySoft : AppColors.surface,
                      borderRadius: BorderRadius.circular(14),
                      child: InkWell(
                        borderRadius: BorderRadius.circular(14),
                        onTap: () => setSheet(() => picked = i),
                        child: Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(
                              color: picked == i ? AppColors.primary : AppColors.border,
                              width: picked == i ? 1.6 : 1,
                            ),
                          ),
                          child: Row(
                            children: [
                              Icon(
                                picked == i ? Icons.radio_button_checked : Icons.radio_button_off,
                                color: picked == i ? AppColors.link : AppColors.textMuted,
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(options[i].$1, style: AppText.h3.copyWith(fontSize: 14)),
                                    Text(options[i].$3, style: AppText.small),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                const SizedBox(height: 4),
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: AppColors.warningSoft,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.info_outline_rounded, size: 18, color: AppColors.warning),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Your current slot will be released for the next customer.',
                          style: AppText.small.copyWith(color: AppColors.text, fontSize: 11.5),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                SizedBox(
                  height: 50,
                  child: FilledButton.icon(
                    onPressed: () {
                      Navigator.of(ctx).pop();
                      AppState.instance.rescheduleBooking(b.id, options[picked].$2);
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text('Moved to ${options[picked].$1}'),
                          behavior: SnackBarBehavior.floating,
                        ),
                      );
                      setState(() {});
                    },
                    icon: const Icon(Icons.check_rounded),
                    label: const Text('Confirm New Time'),
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final app = AppState.instance;
    return ListenableBuilder(
      listenable: app,
      builder: (context, _) {
        final booking = _booking;
        final cancelled = booking?.state == BookingState.cancelled;

        return Scaffold(
          backgroundColor: AppColors.bg,
          appBar: AppBar(
            title: const Text('Live Queue & ETA'),
            backgroundColor: AppColors.bg,
            foregroundColor: AppColors.navy,
            elevation: 0,
          ),
          body: booking == null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(
                      'No upcoming booking.\nBook a service to see your live queue position and ETA.',
                      textAlign: TextAlign.center,
                      style: AppText.muted,
                    ),
                  ),
                )
              : ListView(
                  padding: const EdgeInsets.all(20),
                  children: [
                    Container(
                      padding: const EdgeInsets.all(18),
                      decoration: BoxDecoration(
                        gradient: cancelled
                            ? LinearGradient(colors: [AppColors.textMuted, AppColors.textFaint])
                            : AppColors.primaryGradient,
                        borderRadius: BorderRadius.circular(26),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            booking.service,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 20,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            'Booking ${booking.id}',
                            style: TextStyle(color: Colors.white.withValues(alpha: 0.9)),
                          ),
                          const SizedBox(height: 16),
                          Text(
                            cancelled ? 'Cancelled' : 'Queue position · #2',
                            style: TextStyle(
                              color: Colors.white.withValues(alpha: 0.95),
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          if (!cancelled) ...[
                            const SizedBox(height: 4),
                            Text(
                              'ETA ~ ${booking.date.hour.toString().padLeft(2, '0')}:${booking.date.minute.toString().padLeft(2, '0')}',
                              style: TextStyle(color: Colors.white.withValues(alpha: 0.9)),
                            ),
                          ],
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      cancelled
                          ? 'This booking was cancelled. Book again from Home when you are ready.'
                          : 'Your bay and mechanic are reserved. We will update this screen as the queue moves.',
                      style: AppText.muted,
                    ),
                    if (!cancelled) ...[
                      const SizedBox(height: 20),
                      SizedBox(
                        height: 48,
                        child: OutlinedButton.icon(
                          onPressed: () => _reschedule(booking),
                          icon: const Icon(Icons.schedule_rounded),
                          label: const Text('Reschedule'),
                          style: OutlinedButton.styleFrom(
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                          ),
                        ),
                      ),
                      const SizedBox(height: 8),
                      TextButton.icon(
                        onPressed: () => _cancel(booking),
                        icon: const Icon(Icons.cancel_outlined, color: AppColors.danger, size: 18),
                        label: Text('Cancel booking', style: TextStyle(color: AppColors.dangerText)),
                      ),
                    ],
                  ],
                ),
        );
      },
    );
  }
}
