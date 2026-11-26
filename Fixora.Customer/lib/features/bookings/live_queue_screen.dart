import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/core.dart';
import '../job/widgets/job_widgets.dart';

/// Live queue & explainable ETA (USP 5).
class LiveQueueScreen extends StatefulWidget {
  final String? bookingId;
  const LiveQueueScreen({super.key, this.bookingId});

  @override
  State<LiveQueueScreen> createState() => _LiveQueueScreenState();
}

class _LiveQueueScreenState extends State<LiveQueueScreen> with SingleTickerProviderStateMixin {
  late final AnimationController _spin =
      AnimationController(vsync: this, duration: const Duration(seconds: 8))..repeat();
  bool _checkedIn = false;

  Booking? get _booking {
    final app = AppState.instance;
    if (widget.bookingId != null) {
      final found = app.bookings.where((b) => b.id == widget.bookingId);
      if (found.isNotEmpty) return found.first;
    }
    return app.nextUpcoming;
  }

  @override
  void dispose() {
    _spin.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: AppState.instance,
      builder: (context, _) => _build(context),
    );
  }

  Widget _build(BuildContext context) {
    final b = _booking;
    if (b == null) {
      return const FxPage(
        title: 'Live Queue & ETA',
        children: [
          EmptyState(
            icon: Icons.event_busy_outlined,
            title: 'No upcoming booking',
            message: 'Book a service to see your live queue position and ETA.',
          ),
        ],
      );
    }
    final cancelled = b.state == BookingState.cancelled;
    final v = AppState.instance.vehicleById(b.vehicleId);
    final pos = b.queuePosition ?? 2;
    final start = b.date.add(Duration(minutes: 5 * pos));
    final ready = start.add(const Duration(minutes: 95));
    return FxPage(
      title: 'Live Queue & ETA',
      subtitle: '${b.service} · ${dayMonthYear(b.date)}',
      children: [
        FadeSlide(
          child: Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              gradient: AppColors.heroGradient,
              borderRadius: BorderRadius.circular(26),
              boxShadow: [
                BoxShadow(color: AppColors.primary.o(0.3), blurRadius: 24, offset: const Offset(0, 12)),
              ],
            ),
            child: Row(
              children: [
                SizedBox(
                  width: 112,
                  height: 112,
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      AnimatedBuilder(
                        animation: _spin,
                        builder: (_, __) => Transform.rotate(
                          angle: _spin.value * 2 * math.pi,
                          child: CustomPaint(size: const Size(112, 112), painter: _ArcPainter()),
                        ),
                      ),
                      Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Text('YOU ARE', style: TextStyle(color: Colors.white70, fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 1)),
                          Text('#$pos', style: const TextStyle(color: Colors.white, fontSize: 38, fontWeight: FontWeight.w800, height: 1.05)),
                          const Text('in queue', style: TextStyle(color: Colors.white70, fontSize: 11)),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Estimated start',
                          style: TextStyle(color: Colors.white70, fontSize: 12.5)),
                      Text(cancelled ? 'Cancelled' : time12(start),
                          style: const TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w800)),
                      const SizedBox(height: 4),
                      Text('Ready by ~${time12(ready)} · ${v.name}',
                          style: TextStyle(color: Colors.white.o(0.85), fontSize: 12)),
                      const SizedBox(height: 10),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(
                          color: Colors.white.o(0.18),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Text('${weekdayShort(b.date)} ${time12(b.date)} · ${b.garage}',
                            style: const TextStyle(color: Colors.white, fontSize: 11.5, fontWeight: FontWeight.w700)),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        const SectionTitle('Why this ETA?', icon: Icons.lightbulb_outline_rounded),
        FadeSlide(
          index: 1,
          child: FxCard(
            padding: const EdgeInsets.all(14),
            child: Column(
              children: [
                _reason(Icons.tire_repair_rounded, AppColors.primary, '+10 min',
                    'Bay 2 is finishing a wheel alignment', 'Started 9:55 AM, about 10 minutes left.'),
                _reason(Icons.priority_high_rounded, AppColors.warning, '+5 min',
                    '1 urgent job approved by the manager', 'Brake failure case. This is logged and audited.'),
                _reason(Icons.engineering_outlined, AppColors.success, '0 min',
                    '${v.fuel}-trained mechanic is free', '${MockData.mechanicName} is assigned to your car.',
                    last: true),
              ],
            ),
          ),
        ),
        const SectionTitle('Queue right now', icon: Icons.format_list_numbered_rounded),
        FadeSlide(
          index: 2,
          child: FxCard(
            padding: const EdgeInsets.all(14),
            child: Column(
              children: [
                ..._rows(pos, v, b),
                const SizedBox(height: 10),
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: AppColors.primarySofter,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.balance_rounded, size: 18, color: AppColors.link),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Fair queue: walk-ins are served between bookings, they cannot push your booked slot by more than 15 min.',
                          style: AppText.small.copyWith(color: AppColors.text, fontSize: 11.5),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 18),
        Row(
          children: [
            Expanded(
              child: OutlineButton2(
                label: 'Reschedule',
                icon: Icons.edit_calendar_outlined,
                fontSize: 14.5,
                onPressed: cancelled ? null : () => _reschedule(b),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: PrimaryButton(
                label: _checkedIn ? 'Checked in' : "I'm on my way",
                icon: _checkedIn ? Icons.check_circle_rounded : Icons.navigation_rounded,
                fontSize: 14.5,
                gradient: _checkedIn ? AppColors.successGradient : AppColors.primaryGradient,
                onPressed: cancelled
                    ? null
                    : () {
                        setState(() => _checkedIn = true);
                        showFxSnack(context, 'The garage knows you are coming. See you soon!');
                      },
              ),
            ),
          ],
        ),
        const SizedBox(height: 6),
        Center(
          child: cancelled
              ? const StatusPill('This booking was cancelled', color: AppColors.danger, icon: Icons.cancel_outlined)
              : TextButton.icon(
                  onPressed: () => _cancel(b),
                  icon: const Icon(Icons.cancel_outlined, color: AppColors.danger, size: 18),
                  label: Text('Cancel booking', style: TextStyle(color: AppColors.dangerText)),
                ),
        ),
      ],
    );
  }

  Widget _reason(IconData icon, Color color, String delta, String title, String sub, {bool last = false}) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10),
      decoration: BoxDecoration(
        border: last ? null : Border(bottom: BorderSide(color: AppColors.divider)),
      ),
      child: Row(
        children: [
          IconTile(icon: icon, color: color, size: 40),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: AppText.h3.copyWith(fontSize: 13.5)),
                const SizedBox(height: 2),
                Text(sub, style: AppText.small.copyWith(fontSize: 11.5)),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(delta, style: TextStyle(color: color, fontWeight: FontWeight.w800, fontSize: 13)),
        ],
      ),
    );
  }

  Widget _queueRow(int pos, String title, String sub, Color color, bool me, {bool last = false}) {
    return Container(
      margin: EdgeInsets.only(bottom: last ? 0 : 8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: me ? AppColors.primarySoft : AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: me ? AppColors.primary : AppColors.border, width: me ? 1.5 : 1),
      ),
      child: Row(
        children: [
          Container(
            width: 32,
            height: 32,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: me ? AppColors.primary : color.o(0.12),
              shape: BoxShape.circle,
            ),
            child: Text('$pos',
                style: TextStyle(
                    color: me ? Colors.white : color, fontWeight: FontWeight.w800, fontSize: 14)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: AppText.h3.copyWith(fontSize: 13.5)),
                Text(sub, style: AppText.small),
              ],
            ),
          ),
          if (pos == 1) const LivePill(text: 'In service'),
        ],
      ),
    );
  }

  List<Widget> _rows(int pos, Vehicle v, Booking b) {
    const others = [
      ('Booked · Honda Fit', 'In bay 2 · alignment'),
      ('Walk-in · Suzuki Wagon R', 'Arrived 15 min ago'),
      ('Booked · Nissan Leaf', 'Booked after you'),
    ];
    var k = 0;
    return [
      for (var p = 1; p <= 4; p++)
        if (p == pos)
          _queueRow(p, 'You · ${v.name}', 'Booked ${time12(b.date)}', AppColors.primary, true, last: p == 4)
        else
          _queueRow(p, others[k % 3].$1, others[k++ % 3].$2, p == 1 ? AppColors.success : AppColors.textMuted, false,
              last: p == 4),
    ];
  }

  Future<void> _cancel(Booking b) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
        title: const Text('Cancel this booking?'),
        content: Text('${b.service} on ${dayMonthYear(b.date)} at ${time12(b.date)} will be cancelled.'),
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
    showFxSnack(context, 'Booking cancelled', icon: Icons.info_outline_rounded);
  }

  void _reschedule(Booking b) {
    final d = b.date;
    final options = [
      ('${time12(d.add(const Duration(hours: 1)))} same day', d.add(const Duration(hours: 1)), 'Wait drops to ~5 min'),
      ('${time12(d.add(const Duration(hours: 4)))} same day', d.add(const Duration(hours: 4)), 'No wait · mechanic free'),
      ('${weekdayShort(d.add(const Duration(days: 1)))} 08:30 AM',
          DateTime(d.year, d.month, d.day + 1, 8, 30), 'First job of the day'),
    ];
    var picked = 0;
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) => Container(
          margin: const EdgeInsets.all(12),
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(26)),
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
                    child: RadioCard(
                      selected: picked == i,
                      color: AppColors.primary,
                      title: options[i].$1,
                      subtitle: options[i].$3,
                      onTap: () => setSheet(() => picked = i),
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
                        child: Text('Your current slot will be released for the next customer.',
                            style: AppText.small.copyWith(color: AppColors.text, fontSize: 11.5)),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                PrimaryButton(
                  label: 'Confirm New Time',
                  icon: Icons.check_rounded,
                  onPressed: () {
                    Navigator.of(ctx).pop();
                    AppState.instance.rescheduleBooking(b.id, options[picked].$2);
                    showFxSnack(context, 'Moved to ${options[picked].$1}');
                  },
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ArcPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final track = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 8
      ..color = Colors.white.o(0.15);
    canvas.drawCircle(rect.center, size.width / 2 - 6, track);
    final arc = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 8
      ..strokeCap = StrokeCap.round
      ..shader = const SweepGradient(colors: [Color(0x00FFFFFF), Colors.white]).createShader(rect);
    canvas.drawArc(rect.deflate(6), 0, math.pi * 1.4, false, arc);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
