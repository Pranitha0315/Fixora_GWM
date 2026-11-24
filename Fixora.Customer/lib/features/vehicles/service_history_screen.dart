import 'package:flutter/material.dart';

import '../../core/core.dart';
import '../bookings/book_service_screen.dart';

/// Service History: completed records and upcoming services for a vehicle.
class ServiceHistoryScreen extends StatefulWidget {
  final String vehicleId;
  final int initialTab;
  const ServiceHistoryScreen({super.key, required this.vehicleId, this.initialTab = 0});

  @override
  State<ServiceHistoryScreen> createState() => _ServiceHistoryScreenState();
}

class _ServiceHistoryScreenState extends State<ServiceHistoryScreen> {
  late int _tab = widget.initialTab;

  @override
  Widget build(BuildContext context) {
    final app = AppState.instance;
    final v = app.vehicleById(widget.vehicleId);
    final history = app.historyFor(v.id);
    final upcoming = app.upcomingFor(v.id);
    // Bookings made in the app also show up as upcoming services.
    final booked = app.bookings
        .where((b) => b.vehicleId == v.id && b.state == BookingState.upcoming)
        .toList();
    final upcomingCount = upcoming.length + booked.length;

    return FxPage(
      title: 'Service History',
      subtitle: '${v.name} service records',
      compactHeader: true,
      children: [
        FadeSlide(
          child: FxCard(
            padding: const EdgeInsets.all(12),
            gradient: LinearGradient(colors: [AppColors.surface, AppColors.adapt(Color(0xFFECFDFC))]),
            child: Row(
              children: [
                SizedBox(width: 130, height: 86, child: VehicleImage(v, radius: 14)),
                Container(width: 1.4, height: 70, margin: const EdgeInsets.symmetric(horizontal: 12), color: AppColors.border),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(v.name, style: AppText.h2.copyWith(fontSize: 19)),
                      const SizedBox(height: 3),
                      Text(v.plate, style: AppText.body),
                      const SizedBox(height: 6),
                      StatusPill(v.active ? 'Active' : 'Inactive',
                          color: v.active ? AppColors.success : AppColors.textMuted),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 14),
        Row(
          children: [
            SizedBox(
              width: 260,
              child: FxPillTabs(
                labels: const ['All', 'Upcoming'],
                index: _tab,
                height: 44,
                onChanged: (i) => setState(() => _tab = i),
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        if (_tab == 0) ...[
          if (history.isEmpty)
            const EmptyState(
              icon: Icons.history_rounded,
              title: 'No service records yet',
              message: 'Completed services at Fixora garages will appear here.',
            ),
          for (var i = 0; i < history.length; i++)
            FadeSlide(index: i, child: _RecordCard(record: history[i])),
          if (history.isNotEmpty) _footer('${history.length} service record${history.length == 1 ? '' : 's'} found', null),
        ] else ...[
          if (upcomingCount == 0)
            EmptyState(
              icon: Icons.event_available_rounded,
              title: 'Nothing scheduled',
              message: 'Book a service and it will show up here.',
              action: SizedBox(
                width: 200,
                child: PrimaryButton(
                  label: 'Book Service',
                  height: 48,
                  onPressed: () => context.push(BookServiceScreen(vehicleId: v.id)),
                ),
              ),
            ),
          for (final b in booked)
            _UpcomingCard(
              icon: Icons.event_available_rounded,
              title: b.service,
              subtitle: 'Booked in app · ${time12(b.date)}',
              garage: b.garage,
              date: b.date,
              highlight: true,
              onTap: () => showFxSnack(context, 'Booked for ${dayMonthYear(b.date)} at ${time12(b.date)}'),
            ),
          for (var i = 0; i < upcoming.length; i++)
            FadeSlide(
              index: i,
              child: _UpcomingCard(
                icon: upcoming[i].icon,
                title: upcoming[i].title,
                subtitle: upcoming[i].subtitle,
                garage: upcoming[i].garage,
                date: upcoming[i].date,
                onTap: () => _bookUpcoming(context, v, upcoming[i]),
              ),
            ),
          if (upcomingCount > 0)
            _footer('$upcomingCount upcoming service${upcomingCount == 1 ? '' : 's'} scheduled', Icons.event_note_rounded),
        ],
      ],
    );
  }

  Widget _footer(String text, IconData? icon) {
    return Container(
      margin: const EdgeInsets.only(top: 4),
      padding: const EdgeInsets.symmetric(vertical: 14),
      decoration: BoxDecoration(
        color: AppColors.primarySoft,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          if (icon != null) ...[Icon(icon, color: AppColors.link), const SizedBox(width: 8)],
          Flexible(child: Text(text, textAlign: TextAlign.center, style: AppText.h3)),
        ],
      ),
    );
  }

  void _bookUpcoming(BuildContext context, Vehicle v, UpcomingService u) {
    showFxSheet<void>(
      context,
      builder: (ctx) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              IconTile(icon: u.icon, size: 50),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(u.title, style: AppText.h1.copyWith(fontSize: 20)),
                    Text(u.subtitle, style: AppText.muted),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          KVRow('Vehicle', '${v.name} · ${v.plate}'),
          KVRow('Recommended date', dayMonthYear(u.date)),
          KVRow('Garage', u.garage),
          const SizedBox(height: 16),
          PrimaryButton(
            label: 'Book This Service',
            icon: Icons.event_available_rounded,
            onPressed: () {
              Navigator.of(ctx).pop();
              context.push(BookServiceScreen(vehicleId: v.id, service: u.service, preferredDate: u.date));
            },
          ),
        ],
      ),
    );
  }
}

class _RecordCard extends StatelessWidget {
  final ServiceRecord record;
  const _RecordCard({required this.record});

  @override
  Widget build(BuildContext context) {
    final r = record;
    final app = AppState.instance;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: FxCard(
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 10),
        onTap: () => _details(context),
        child: Column(
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                IconTile(icon: r.icon, size: 46),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(r.title, style: AppText.h3.copyWith(fontSize: 15.5)),
                      Text(r.subtitle, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.small.copyWith(fontSize: 12)),
                      const SizedBox(height: 3),
                      Row(
                        children: [
                          Icon(Icons.store_mall_directory_outlined, size: 14, color: AppColors.navy),
                          const SizedBox(width: 4),
                          Flexible(
                            child: Text(r.garage,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: AppText.small.copyWith(fontSize: 12, color: AppColors.text)),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                Icon(Icons.chevron_right_rounded, color: AppColors.link),
              ],
            ),
            Divider(height: 18, color: AppColors.divider),
            Row(
              children: [
                Icon(Icons.calendar_today_outlined, size: 15, color: AppColors.link),
                const SizedBox(width: 5),
                Text(dayMonthYear(r.date), style: AppText.label.copyWith(fontSize: 12.5)),
                const SizedBox(width: 10),
                Icon(Icons.speed_rounded, size: 16, color: AppColors.link),
                const SizedBox(width: 5),
                Expanded(child: Text(app.distance(r.mileageKm), style: AppText.label.copyWith(fontSize: 12.5))),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(color: AppColors.success, borderRadius: BorderRadius.circular(20)),
                  child: const Text('Completed',
                      style: TextStyle(color: Colors.white, fontSize: 11.5, fontWeight: FontWeight.w700)),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  void _details(BuildContext context) {
    final r = record;
    showFxSheet<void>(
      context,
      builder: (ctx) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(child: Text(r.title, style: AppText.h1)),
              const StatusPill('Completed', color: AppColors.success, icon: Icons.check_circle_rounded),
            ],
          ),
          const SizedBox(height: 4),
          Text('${r.jobId} · ${dayMonthYear(r.date)} · ${r.garage}', style: AppText.muted),
          const SizedBox(height: 14),
          Text('Work done', style: AppText.h3),
          const SizedBox(height: 8),
          for (final w in r.work)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(
                children: [
                  const Icon(Icons.check_circle_rounded, size: 18, color: AppColors.success),
                  const SizedBox(width: 8),
                  Expanded(child: Text(w, style: AppText.body)),
                ],
              ),
            ),
          const SizedBox(height: 8),
          TotalBar(label: 'Amount paid', value: lkr(r.amount), fontSize: 19),
          const SizedBox(height: 14),
          OutlineButton2(
            label: 'Download Invoice',
            icon: Icons.download_rounded,
            onPressed: () {
              Navigator.of(ctx).pop();
              showFxSnack(context, 'Invoice ${r.jobId} downloaded');
            },
          ),
        ],
      ),
    );
  }
}

class _UpcomingCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final String garage;
  final DateTime date;
  final VoidCallback onTap;
  final bool highlight;

  const _UpcomingCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.garage,
    required this.date,
    required this.onTap,
    this.highlight = false,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: FxCard(
        padding: const EdgeInsets.all(12),
        onTap: onTap,
        borderColor: highlight ? AppColors.primary.o(0.5) : null,
        child: Row(
          children: [
            IconTile(icon: icon, size: 48),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: AppText.h3.copyWith(fontSize: 15.5)),
                  Text(subtitle, maxLines: 2, overflow: TextOverflow.ellipsis, style: AppText.small.copyWith(fontSize: 12)),
                  const SizedBox(height: 3),
                  Row(
                    children: [
                      Icon(Icons.store_mall_directory_outlined, size: 14, color: AppColors.navy),
                      const SizedBox(width: 4),
                      Flexible(child: Text(garage, style: AppText.small.copyWith(fontSize: 12, color: AppColors.text))),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(width: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 7),
              decoration: BoxDecoration(color: AppColors.primarySoft, borderRadius: BorderRadius.circular(10)),
              child: Column(
                children: [
                  Text(monthShort(date.month).toUpperCase(),
                      style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.link)),
                  Text('${date.day}',
                      style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.navy, height: 1.1)),
                  Text('${date.year}', style: TextStyle(fontSize: 10, color: AppColors.textMuted)),
                ],
              ),
            ),
            Icon(Icons.chevron_right_rounded, color: AppColors.link),
          ],
        ),
      ),
    );
  }
}
