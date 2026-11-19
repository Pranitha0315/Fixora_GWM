import 'package:flutter/material.dart';

import '../../core/navigation/nav.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../data/models/models.dart';
import '../../data/models/vehicle.dart';
import '../../data/repositories/app_state.dart';
import '../../data/repositories/job_store.dart';
import '../job/screens/job_tracker_screen.dart';
import 'book_service_screen.dart';
import 'live_queue_screen.dart';

class BookingsScreen extends StatefulWidget {
  const BookingsScreen({super.key});

  @override
  State<BookingsScreen> createState() => _BookingsScreenState();
}

class _BookingsScreenState extends State<BookingsScreen> {
  int _tab = 0;

  static const _weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  static const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  String _time12(DateTime d) {
    final h = d.hour % 12 == 0 ? 12 : d.hour % 12;
    final m = d.minute.toString().padLeft(2, '0');
    final ap = d.hour >= 12 ? 'PM' : 'AM';
    return '$h:$m $ap';
  }

  String _dayMonthYear(DateTime d) => '${d.day} ${_months[d.month - 1]} ${d.year}';

  String _weekdayShort(DateTime d) => _weekdays[d.weekday - 1];

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: Listenable.merge([AppState.instance, JobStore.instance]),
      builder: (context, _) => _content(context),
    );
  }

  Widget _content(BuildContext context) {
    final app = AppState.instance;
    final lists = [
      app.bookingsIn({BookingState.active}),
      app.bookingsIn({BookingState.upcoming})..sort((a, b) => a.date.compareTo(b.date)),
      app.bookingsIn({BookingState.completed, BookingState.cancelled}),
    ];
    final list = lists[_tab];
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        title: const Text('My Bookings'),
        backgroundColor: AppColors.bg,
        foregroundColor: AppColors.navy,
        elevation: 0,
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: Material(
              borderRadius: BorderRadius.circular(14),
              child: InkWell(
                borderRadius: BorderRadius.circular(14),
                onTap: () => context.push(BookServiceScreen(vehicleId: app.selectedVehicle.id)),
                child: Ink(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    gradient: AppColors.primaryGradient,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.add_rounded, color: Colors.white, size: 20),
                      SizedBox(width: 4),
                      Text('Book', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
        children: [
          Text('Track jobs, appointments and past visits.', style: AppText.muted),
          const SizedBox(height: 14),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (final e in [
                  (0, 'Active (${lists[0].length})'),
                  (1, 'Upcoming (${lists[1].length})'),
                  (2, 'Past (${lists[2].length})'),
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
          const SizedBox(height: 14),
          if (list.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 60),
              child: Center(child: Text('Nothing here yet.', style: AppText.muted)),
            )
          else
            for (final booking in list)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: _BookingCard(
                  booking: booking,
                  time12: _time12,
                  dayMonthYear: _dayMonthYear,
                  weekdayShort: _weekdayShort,
                ),
              ),
        ],
      ),
    );
  }
}

class _BookingCard extends StatelessWidget {
  final Booking booking;
  final String Function(DateTime) time12;
  final String Function(DateTime) dayMonthYear;
  final String Function(DateTime) weekdayShort;

  const _BookingCard({
    required this.booking,
    required this.time12,
    required this.dayMonthYear,
    required this.weekdayShort,
  });

  @override
  Widget build(BuildContext context) {
    final v = AppState.instance.vehicleById(booking.vehicleId);
    final isActive = booking.state == BookingState.active;
    final color = switch (booking.state) {
      BookingState.active => AppColors.primary,
      BookingState.upcoming => AppColors.teal,
      BookingState.completed => AppColors.success,
      BookingState.cancelled => AppColors.danger,
    };
    final label = booking.statusLabel;

    return Material(
      color: AppColors.surfaceSolid,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: () {
          switch (booking.state) {
            case BookingState.active:
              context.push(const JobTrackerScreen());
            case BookingState.upcoming:
              context.push(LiveQueueScreen(bookingId: booking.id));
            case BookingState.completed:
            case BookingState.cancelled:
              _showPast(context, booking, v);
          }
        },
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: AppColors.border),
          ),
          child: Column(
            children: [
              Row(
                children: [
                  Container(
                    width: 92,
                    height: 58,
                    decoration: BoxDecoration(
                      color: AppColors.primarySofter,
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Icon(Icons.directions_car_outlined, color: AppColors.link),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(booking.service, style: AppText.h3),
                        const SizedBox(height: 2),
                        Text(
                          '${v.name} · ${v.plate}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppText.small.copyWith(fontSize: 12),
                        ),
                        const SizedBox(height: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: color.o(0.12),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Text(
                            label,
                            style: TextStyle(color: color, fontWeight: FontWeight.w700, fontSize: 12),
                          ),
                        ),
                      ],
                    ),
                  ),
                  Icon(Icons.chevron_right_rounded, color: AppColors.textMuted),
                ],
              ),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                decoration: BoxDecoration(
                  color: AppColors.primarySofter,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  children: [
                    Icon(Icons.calendar_today_rounded, size: 15, color: AppColors.link),
                    const SizedBox(width: 6),
                    Flexible(
                      child: Text(
                        '${weekdayShort(booking.date)}, ${dayMonthYear(booking.date)}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppText.small.copyWith(color: AppColors.navy, fontWeight: FontWeight.w600),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Icon(Icons.schedule_rounded, size: 15, color: AppColors.link),
                    const SizedBox(width: 4),
                    Text(
                      time12(booking.date),
                      style: AppText.small.copyWith(color: AppColors.navy, fontWeight: FontWeight.w600),
                    ),
                    const Spacer(),
                    if (booking.amount != null)
                      Text(
                        'LKR ${booking.amount!.toStringAsFixed(0)}',
                        style: AppText.small.copyWith(color: AppColors.navy, fontWeight: FontWeight.w800),
                      )
                    else if (booking.queuePosition != null)
                      Text(
                        'Queue #${booking.queuePosition}',
                        style: AppText.small.copyWith(color: AppColors.link, fontWeight: FontWeight.w800),
                      )
                    else if (isActive)
                      Text(
                        booking.id,
                        style: AppText.small.copyWith(color: AppColors.link, fontWeight: FontWeight.w700),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showPast(BuildContext context, Booking b, Vehicle v) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        margin: const EdgeInsets.all(12),
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(color: AppColors.surfaceSolid, borderRadius: BorderRadius.circular(24)),
        child: SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(child: Text(b.service, style: AppText.h1)),
                  Text(
                    b.statusLabel,
                    style: TextStyle(
                      color: b.state == BookingState.cancelled ? AppColors.danger : AppColors.success,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text('${b.id} · ${dayMonthYear(b.date)}', style: AppText.muted),
              const SizedBox(height: 16),
              Text('${v.name} · ${v.plate}', style: AppText.h3),
              const SizedBox(height: 14),
              SizedBox(
                width: double.infinity,
                height: 48,
                child: FilledButton.icon(
                  onPressed: () {
                    Navigator.of(ctx).pop();
                    context.push(BookServiceScreen(vehicleId: b.vehicleId, service: b.service));
                  },
                  icon: const Icon(Icons.replay_rounded),
                  label: const Text('Book Again'),
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
    );
  }
}
