import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../data/models/vehicle.dart';
import '../../data/repositories/app_state.dart';

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

  static const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  static const _weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  Booking? get _booking {
    final app = AppState.instance;
    if (widget.bookingId != null) {
      final found = app.bookings.where((b) => b.id == widget.bookingId);
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

  String _dayMonthYear(DateTime d) => '${d.day} ${_months[d.month - 1]} ${d.year}';

  String _weekdayShort(DateTime d) => _weekdays[d.weekday - 1];

  void _snack(String message, {IconData icon = Icons.check_circle_rounded}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            Icon(icon, color: Colors.white, size: 20),
            const SizedBox(width: 10),
            Expanded(child: Text(message)),
          ],
        ),
        behavior: SnackBarBehavior.floating,
      ),
    );
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
      return Scaffold(
        backgroundColor: AppColors.bg,
        appBar: AppBar(
          title: const Text('Live Queue & ETA'),
          backgroundColor: AppColors.bg,
          foregroundColor: AppColors.navy,
          elevation: 0,
        ),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.event_busy_outlined, size: 48, color: AppColors.textMuted),
                const SizedBox(height: 12),
                Text('No upcoming booking', style: AppText.h2),
                const SizedBox(height: 6),
                Text(
                  'Book a service to see your live queue position and ETA.',
                  textAlign: TextAlign.center,
                  style: AppText.muted,
                ),
              ],
            ),
          ),
        ),
      );
    }

    final cancelled = b.state == BookingState.cancelled;
    final v = AppState.instance.vehicleById(b.vehicleId);
    final pos = b.queuePosition ?? 2;
    final start = b.date.add(Duration(minutes: 5 * pos));
    final ready = start.add(const Duration(minutes: 95));
    final garage = b.garage;

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        title: const Text('Live Queue & ETA'),
        backgroundColor: AppColors.bg,
        foregroundColor: AppColors.navy,
        elevation: 0,
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
        children: [
          Text('${b.service} · ${_dayMonthYear(b.date)}', style: AppText.muted),
          const SizedBox(height: 12),
          Container(
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
                          const Text(
                            'YOU ARE',
                            style: TextStyle(
                              color: Colors.white70,
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 1,
                            ),
                          ),
                          Text(
                            '#$pos',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 38,
                              fontWeight: FontWeight.w800,
                              height: 1.05,
                            ),
                          ),
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
                      const Text(
                        'Estimated start',
                        style: TextStyle(color: Colors.white70, fontSize: 12.5),
                      ),
                      Text(
                        cancelled ? 'Cancelled' : _time12(start),
                        style: const TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w800),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Ready by ~${_time12(ready)} · ${v.name}',
                        style: TextStyle(color: Colors.white.o(0.85), fontSize: 12),
                      ),
                      const SizedBox(height: 10),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(
                          color: Colors.white.o(0.18),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Text(
                          '${_weekdayShort(b.date)} ${_time12(b.date)} · $garage',
                          style: const TextStyle(color: Colors.white, fontSize: 11.5, fontWeight: FontWeight.w700),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),
          _sectionTitle('Why this ETA?', Icons.lightbulb_outline_rounded),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppColors.surfaceSolid,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: AppColors.border),
            ),
            child: Column(
              children: [
                _reason(
                  Icons.tire_repair_rounded,
                  AppColors.primary,
                  '+10 min',
                  'Bay 2 is finishing a wheel alignment',
                  'Started 9:55 AM, about 10 minutes left.',
                ),
                _reason(
                  Icons.priority_high_rounded,
                  AppColors.warning,
                  '+5 min',
                  '1 urgent job approved by the manager',
                  'Brake failure case. This is logged and audited.',
                ),
                _reason(
                  Icons.engineering_outlined,
                  AppColors.success,
                  '0 min',
                  '${v.fuel}-trained mechanic is free',
                  'Kasun Perera is assigned to your car.',
                  last: true,
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),
          _sectionTitle('Queue right now', Icons.format_list_numbered_rounded),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppColors.surfaceSolid,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: AppColors.border),
            ),
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
          const SizedBox(height: 18),
          Row(
            children: [
              Expanded(
                child: SizedBox(
                  height: 50,
                  child: OutlinedButton.icon(
                    onPressed: cancelled ? null : () => _reschedule(b),
                    icon: const Icon(Icons.edit_calendar_outlined),
                    label: const Text('Reschedule'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.navy,
                      side: BorderSide(color: AppColors.border),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: SizedBox(
                  height: 50,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: cancelled
                          ? null
                          : (_checkedIn ? AppColors.successGradient : AppColors.primaryGradient),
                      color: cancelled ? AppColors.textMuted : null,
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: FilledButton.icon(
                      onPressed: cancelled
                          ? null
                          : () {
                              setState(() => _checkedIn = true);
                              _snack('The garage knows you are coming. See you soon!');
                            },
                      icon: Icon(_checkedIn ? Icons.check_circle_rounded : Icons.navigation_rounded),
                      label: Text(_checkedIn ? 'Checked in' : "I'm on my way"),
                      style: FilledButton.styleFrom(
                        backgroundColor: Colors.transparent,
                        shadowColor: Colors.transparent,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Center(
            child: cancelled
                ? Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: AppColors.dangerSoft,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.cancel_outlined, color: AppColors.danger, size: 16),
                        const SizedBox(width: 6),
                        Text(
                          'This booking was cancelled',
                          style: TextStyle(color: AppColors.dangerText, fontWeight: FontWeight.w700, fontSize: 12.5),
                        ),
                      ],
                    ),
                  )
                : TextButton.icon(
                    onPressed: () => _cancel(b),
                    icon: const Icon(Icons.cancel_outlined, color: AppColors.danger, size: 18),
                    label: Text('Cancel booking', style: TextStyle(color: AppColors.dangerText)),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _sectionTitle(String title, IconData icon) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          Icon(icon, size: 18, color: AppColors.link),
          const SizedBox(width: 8),
          Text(title, style: AppText.h2.copyWith(fontSize: 16)),
        ],
      ),
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
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(color: color.o(0.12), borderRadius: BorderRadius.circular(12)),
            child: Icon(icon, color: color, size: 20),
          ),
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
            child: Text(
              '$pos',
              style: TextStyle(color: me ? Colors.white : color, fontWeight: FontWeight.w800, fontSize: 14),
            ),
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
          if (pos == 1)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: AppColors.successSoft,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                'In service',
                style: TextStyle(color: AppColors.successText, fontWeight: FontWeight.w700, fontSize: 11),
              ),
            ),
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
          _queueRow(p, 'You · ${v.name}', 'Booked ${_time12(b.date)}', AppColors.primary, true, last: p == 4)
        else
          _queueRow(
            p,
            others[k % 3].$1,
            others[k++ % 3].$2,
            p == 1 ? AppColors.success : AppColors.textMuted,
            false,
            last: p == 4,
          ),
    ];
  }

  Future<void> _cancel(Booking b) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
        title: const Text('Cancel this booking?'),
        content: Text('${b.service} on ${_dayMonthYear(b.date)} at ${_time12(b.date)} will be cancelled.'),
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
    _snack('Booking cancelled', icon: Icons.info_outline_rounded);
  }

  void _reschedule(Booking b) {
    final d = b.date;
    final options = <(String, DateTime, String)>[
      ('${_time12(d.add(const Duration(hours: 1)))} same day', d.add(const Duration(hours: 1)), 'Wait drops to ~5 min'),
      ('${_time12(d.add(const Duration(hours: 4)))} same day', d.add(const Duration(hours: 4)), 'No wait · mechanic free'),
      (
        '${_weekdayShort(d.add(const Duration(days: 1)))} 08:30 AM',
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
                      _snack('Moved to ${options[picked].$1}');
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
