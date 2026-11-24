import 'package:flutter/material.dart';

import '../../core/core.dart';
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
    return FxPage(
      title: 'My Bookings',
      subtitle: 'Track jobs, appointments and past visits.',
      showBack: false,
      trailing: Material(
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: () => context.push(BookServiceScreen(vehicleId: AppState.instance.selectedVehicle.id)),
          child: Ink(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              gradient: AppColors.primaryGradient,
              borderRadius: BorderRadius.circular(14),
              boxShadow: AppShadows.button,
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
      children: [
        FxSegmented(
          index: _tab,
          onChanged: (i) => setState(() => _tab = i),
          items: [
            SegItem('Active (${lists[0].length})'),
            SegItem('Upcoming (${lists[1].length})'),
            SegItem('Past (${lists[2].length})'),
          ],
        ),
        const SizedBox(height: 14),
        AnimatedSwitcher(
          duration: const Duration(milliseconds: 260),
          child: Column(
            key: ValueKey(_tab),
            children: [
              if (list.isEmpty)
                Padding(
                  padding: EdgeInsets.symmetric(vertical: 60),
                  child: Text('Nothing here yet.', style: AppText.muted),
                ),
              for (var i = 0; i < list.length; i++)
                FadeSlide(
                  index: i,
                  child: Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: _BookingCard(booking: list[i]),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _BookingCard extends StatelessWidget {
  final Booking booking;
  const _BookingCard({required this.booking});

  @override
  Widget build(BuildContext context) {
    final v = AppState.instance.vehicleById(booking.vehicleId);
    final store = JobStore.instance;
    final isActive = booking.state == BookingState.active;
    final color = switch (booking.state) {
      BookingState.active => AppColors.primary,
      BookingState.upcoming => AppColors.teal,
      BookingState.completed => AppColors.success,
      BookingState.cancelled => AppColors.danger,
    };
    final label = isActive ? store.statusLabel : booking.statusLabel;

    return FxCard(
      padding: const EdgeInsets.all(14),
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
                child: VehicleImage(v, radius: 14, fit: BoxFit.contain, background: AppColors.primarySofter),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(booking.service, style: AppText.h3),
                    const SizedBox(height: 2),
                    Text('${v.name} · ${v.plate}',
                        maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.small.copyWith(fontSize: 12)),
                    const SizedBox(height: 6),
                    StatusPill(label, color: color, dot: true),
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
                  child: Text('${weekdayShort(booking.date)}, ${dayMonthYear(booking.date)}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppText.small.copyWith(color: AppColors.navy, fontWeight: FontWeight.w600)),
                ),
                const SizedBox(width: 10),
                Icon(Icons.schedule_rounded, size: 15, color: AppColors.link),
                const SizedBox(width: 4),
                Text(time12(booking.date),
                    style: AppText.small.copyWith(color: AppColors.navy, fontWeight: FontWeight.w600)),
                const Spacer(),
                const SizedBox(width: 8),
                if (booking.amount != null)
                  Text(lkr(booking.amount!),
                      style: AppText.small.copyWith(color: AppColors.navy, fontWeight: FontWeight.w800))
                else if (booking.queuePosition != null)
                  Text('Queue #${booking.queuePosition}',
                      style: AppText.small.copyWith(color: AppColors.link, fontWeight: FontWeight.w800))
                else if (isActive)
                  Text(booking.id,
                      style: AppText.small.copyWith(color: AppColors.link, fontWeight: FontWeight.w700)),
              ],
            ),
          ),
          if (isActive) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(child: FxProgressBar(value: store.journey, height: 6)),
                const SizedBox(width: 10),
                Text('${(store.journey * 100).round()}%',
                    style: TextStyle(fontWeight: FontWeight.w800, color: AppColors.link)),
              ],
            ),
          ],
        ],
      ),
    );
  }

  void _showPast(BuildContext context, Booking b, Vehicle v) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        margin: const EdgeInsets.all(12),
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(24)),
        child: SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(child: Text(b.service, style: AppText.h1)),
                  StatusPill(b.statusLabel,
                      color: b.state == BookingState.cancelled ? AppColors.danger : AppColors.success),
                ],
              ),
              const SizedBox(height: 4),
              Text('${b.id} · ${dayMonthYear(b.date)}', style: AppText.muted),
              const SizedBox(height: 16),
              VehicleStrip(vehicle: v, compact: true),
              if (b.amount != null) ...[
                const SizedBox(height: 14),
                TotalBar(label: 'Paid', value: lkr(b.amount!), fontSize: 19),
                const SizedBox(height: 14),
                Row(
                  children: [
                    Expanded(
                      child: OutlineButton2(
                        label: 'Invoice',
                        icon: Icons.download_rounded,
                        height: 48,
                        fontSize: 14.5,
                        onPressed: () {
                          Navigator.of(ctx).pop();
                          showFxSnack(context, 'Invoice ${b.id} downloaded');
                        },
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: PrimaryButton(
                        label: 'Book Again',
                        icon: Icons.replay_rounded,
                        height: 48,
                        fontSize: 14.5,
                        onPressed: () {
                          Navigator.of(ctx).pop();
                          context.push(BookServiceScreen(vehicleId: b.vehicleId, service: b.service));
                        },
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}