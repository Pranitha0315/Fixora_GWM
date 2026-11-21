import 'package:flutter/material.dart';

import '../../core/navigation/nav.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../data/models/models.dart';
import '../../data/models/vehicle.dart';
import '../../data/repositories/app_state.dart';
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

  static const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  String _dayMonthYear(DateTime d) => '${d.day} ${_months[d.month - 1]} ${d.year}';

  String _time12(DateTime d) {
    final h = d.hour % 12 == 0 ? 12 : d.hour % 12;
    final m = d.minute.toString().padLeft(2, '0');
    final ap = d.hour >= 12 ? 'PM' : 'AM';
    return '$h:$m $ap';
  }

  @override
  Widget build(BuildContext context) {
    final app = AppState.instance;
    final v = app.vehicleById(widget.vehicleId);
    // historyFor(vehicleId) → ServiceRecord cards
    final history = app.historyFor(v.id);
    final upcoming = app.upcomingFor(v.id);
    // Bookings made in the app also show up as upcoming services.
    final booked = app.bookings
        .where((b) => b.vehicleId == v.id && b.state == BookingState.upcoming)
        .toList();
    final upcomingCount = upcoming.length + booked.length;

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        title: const Text('Service History'),
        backgroundColor: AppColors.bg,
        foregroundColor: AppColors.navy,
        elevation: 0,
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
        children: [
          Text('${v.name} service records', style: AppText.muted),
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(20),
              gradient: LinearGradient(colors: [AppColors.surface, AppColors.adapt(const Color(0xFFECFDFC))]),
            ),
            child: Row(
              children: [
                Container(
                  width: 112,
                  height: 80,
                  decoration: BoxDecoration(
                    color: AppColors.primarySoft,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Icon(v.type.icon, size: 40, color: AppColors.link),
                ),
                Container(
                  width: 1.4,
                  height: 70,
                  margin: const EdgeInsets.symmetric(horizontal: 12),
                  color: AppColors.border,
                ),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(v.name, style: AppText.h2.copyWith(fontSize: 19)),
                      const SizedBox(height: 3),
                      Text(v.plate, style: AppText.body),
                      const SizedBox(height: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                        decoration: BoxDecoration(
                          color: v.active ? AppColors.success : AppColors.textMuted,
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Text(
                          v.active ? 'Active' : 'Inactive',
                          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 12.5),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          // tabs: All (completed records) | Upcoming
          Row(
            children: [
              for (final e in const [(0, 'All'), (1, 'Upcoming')])
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
          const SizedBox(height: 14),
          if (_tab == 0) ...[
            if (history.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 40),
                child: Column(
                  children: [
                    Icon(Icons.history_rounded, size: 48, color: AppColors.textMuted),
                    const SizedBox(height: 10),
                    Text('No service records yet', style: AppText.h2),
                    const SizedBox(height: 4),
                    Text(
                      'Completed services at Fixora garages will appear here.',
                      textAlign: TextAlign.center,
                      style: AppText.muted,
                    ),
                  ],
                ),
              ),
            for (final record in history) _RecordCard(record: record, dayMonthYear: _dayMonthYear),
            if (history.isNotEmpty)
              _footer('${history.length} service record${history.length == 1 ? '' : 's'} found', null),
          ] else ...[
            if (upcomingCount == 0)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 40),
                child: Column(
                  children: [
                    Icon(Icons.event_available_rounded, size: 48, color: AppColors.textMuted),
                    const SizedBox(height: 10),
                    Text('Nothing scheduled', style: AppText.h2),
                    const SizedBox(height: 4),
                    Text('Book a service and it will show up here.', style: AppText.muted),
                    const SizedBox(height: 14),
                    SizedBox(
                      width: 200,
                      height: 48,
                      child: FilledButton(
                        onPressed: () => context.push(BookServiceScreen(vehicleId: v.id)),
                        style: FilledButton.styleFrom(backgroundColor: AppColors.primary),
                        child: const Text('Book Service'),
                      ),
                    ),
                  ],
                ),
              ),
            for (final b in booked)
              _UpcomingCard(
                icon: Icons.event_available_rounded,
                title: b.service,
                subtitle: 'Booked in app · ${_time12(b.date)}',
                garage: b.garage,
                date: b.date,
                highlight: true,
                onTap: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text('Booked for ${_dayMonthYear(b.date)} at ${_time12(b.date)}'),
                      behavior: SnackBarBehavior.floating,
                    ),
                  );
                },
              ),
            for (final u in upcoming)
              _UpcomingCard(
                icon: u.icon,
                title: u.title,
                subtitle: u.subtitle,
                garage: u.garage,
                date: u.date,
                onTap: () => _bookUpcoming(context, v, u),
              ),
            if (upcomingCount > 0)
              _footer(
                '$upcomingCount upcoming service${upcomingCount == 1 ? '' : 's'} scheduled',
                Icons.event_note_rounded,
              ),
          ],
        ],
      ),
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
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Container(
                    width: 50,
                    height: 50,
                    decoration: BoxDecoration(color: AppColors.primarySoft, borderRadius: BorderRadius.circular(14)),
                    child: Icon(u.icon, color: AppColors.link),
                  ),
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
              _kv('Vehicle', '${v.name} · ${v.plate}'),
              _kv('Recommended date', _dayMonthYear(u.date)),
              _kv('Garage', u.garage),
              const SizedBox(height: 16),
              SizedBox(
                height: 50,
                child: FilledButton.icon(
                  onPressed: () {
                    Navigator.of(ctx).pop();
                    context.push(BookServiceScreen(
                      vehicleId: v.id,
                      service: u.service,
                      preferredDate: u.date,
                    ));
                  },
                  icon: const Icon(Icons.event_available_rounded),
                  label: const Text('Book This Service'),
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

  Widget _kv(String k, String v) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(
          children: [
            SizedBox(width: 130, child: Text(k, style: AppText.muted)),
            Expanded(child: Text(v, style: AppText.label)),
          ],
        ),
      );
}

class _RecordCard extends StatelessWidget {
  final ServiceRecord record;
  final String Function(DateTime) dayMonthYear;
  const _RecordCard({required this.record, required this.dayMonthYear});

  @override
  Widget build(BuildContext context) {
    final r = record;
    final app = AppState.instance;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: AppColors.surfaceSolid,
        borderRadius: BorderRadius.circular(18),
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: () => _details(context),
          child: Container(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 10),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: AppColors.border),
            ),
            child: Column(
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 46,
                      height: 46,
                      decoration: BoxDecoration(color: AppColors.primarySoft, borderRadius: BorderRadius.circular(12)),
                      child: Icon(r.icon, color: AppColors.link),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(r.title, style: AppText.h3.copyWith(fontSize: 15.5)),
                          Text(
                            r.subtitle,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: AppText.small.copyWith(fontSize: 12),
                          ),
                          const SizedBox(height: 3),
                          Row(
                            children: [
                              Icon(Icons.store_mall_directory_outlined, size: 14, color: AppColors.navy),
                              const SizedBox(width: 4),
                              Flexible(
                                child: Text(
                                  r.garage,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: AppText.small.copyWith(fontSize: 12, color: AppColors.text),
                                ),
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
                      child: const Text(
                        'Completed',
                        style: TextStyle(color: Colors.white, fontSize: 11.5, fontWeight: FontWeight.w700),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _details(BuildContext context) {
    final r = record;
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
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Expanded(child: Text(r.title, style: AppText.h1)),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(color: AppColors.successSoft, borderRadius: BorderRadius.circular(20)),
                    child: Text('Completed', style: TextStyle(color: AppColors.successText, fontWeight: FontWeight.w700)),
                  ),
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
              Text('Amount paid · LKR ${r.amount.toStringAsFixed(0)}', style: AppText.h2),
              const SizedBox(height: 14),
              OutlinedButton.icon(
                onPressed: () {
                  Navigator.of(ctx).pop();
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Invoice ${r.jobId} downloaded'), behavior: SnackBarBehavior.floating),
                  );
                },
                icon: const Icon(Icons.download_rounded),
                label: const Text('Download Invoice'),
              ),
            ],
          ),
        ),
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

  static const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: AppColors.surfaceSolid,
        borderRadius: BorderRadius.circular(18),
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              border: Border.all(
                color: highlight ? AppColors.primary.o(0.5) : AppColors.border,
              ),
            ),
            child: Row(
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(color: AppColors.primarySoft, borderRadius: BorderRadius.circular(12)),
                  child: Icon(icon, color: AppColors.link),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: AppText.h3.copyWith(fontSize: 15.5)),
                      Text(
                        subtitle,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: AppText.small.copyWith(fontSize: 12),
                      ),
                      const SizedBox(height: 3),
                      Row(
                        children: [
                          Icon(Icons.store_mall_directory_outlined, size: 14, color: AppColors.navy),
                          const SizedBox(width: 4),
                          Flexible(
                            child: Text(garage, style: AppText.small.copyWith(fontSize: 12, color: AppColors.text)),
                          ),
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
                      Text(
                        _months[date.month - 1].toUpperCase(),
                        style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.link),
                      ),
                      Text(
                        '${date.day}',
                        style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.navy, height: 1.1),
                      ),
                      Text('${date.year}', style: TextStyle(fontSize: 10, color: AppColors.textMuted)),
                    ],
                  ),
                ),
                Icon(Icons.chevron_right_rounded, color: AppColors.link),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
