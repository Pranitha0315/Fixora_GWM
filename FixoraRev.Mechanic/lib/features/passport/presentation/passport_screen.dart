import 'package:flutter/material.dart';

import '../../../core/di/app_services.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/utils/nav.dart';
import '../../../core/widgets/rev_common.dart';
import '../../jobs/presentation/widgets/job_card.dart';
import '../domain/passport_entities.dart';
import 'passport_detail_screen.dart';

/// Unresolved Diagnostic Evidence Passport – all entries for the garage.
class PassportScreen extends StatefulWidget {
  const PassportScreen({super.key, this.standalone = false});

  /// True when pushed as its own page (shows a back button).
  final bool standalone;

  @override
  State<PassportScreen> createState() => _PassportScreenState();
}

class _PassportScreenState extends State<PassportScreen> {
  PassportStatus? _filter;
  bool _openOnly = true;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: AppServices.passport,
      builder: (context, _) {
        var entries = AppServices.passport.entries;
        if (_filter != null) {
          entries = entries.where((e) => e.status == _filter).toList();
        } else if (_openOnly) {
          entries = entries.where((e) => e.status.isOpen).toList();
        }
        return Scaffold(
          appBar: AppBar(
            automaticallyImplyLeading: widget.standalone,
            title: const Text('Evidence Passport'),
          ),
          body: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: [
              Text(
                'Issues that could not be confirmed in one visit. Each record is hash-chained, '
                'so nothing can be edited silently, and it re-surfaces when the vehicle returns.',
                style: TextStyle(
                    color: AppColors.inkSoft, height: 1.4, fontSize: 13),
              ),
              const SizedBox(height: 12),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    _FilterChip(
                      label: 'Open',
                      selected: _filter == null && _openOnly,
                      onTap: () => setState(() {
                        _filter = null;
                        _openOnly = true;
                      }),
                    ),
                    _FilterChip(
                      label: 'All',
                      selected: _filter == null && !_openOnly,
                      onTap: () => setState(() {
                        _filter = null;
                        _openOnly = false;
                      }),
                    ),
                    for (final s in PassportStatus.values)
                      _FilterChip(
                        label: s.label,
                        selected: _filter == s,
                        color: s.color,
                        onTap: () => setState(() => _filter = s),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              if (entries.isEmpty)
                EmptyState(
                  icon: Icons.menu_book_outlined,
                  title: 'No passport entries here',
                  message: 'Issues you park for later, and their photos, are kept here for the next visit.',
                  actionLabel: 'Show all entries',
                  actionIcon: Icons.filter_alt_off_rounded,
                  onAction: () => setState(() {
                    _filter = null;
                    _openOnly = false;
                  }),
                )
              else
                for (final e in entries) _EntryCard(entry: e),
            ],
          ),
        );
      },
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip(
      {required this.label,
      required this.selected,
      required this.onTap,
      this.color});
  final String label;
  final bool selected;
  final VoidCallback onTap;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = color ?? AppColors.primary;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          constraints: const BoxConstraints(minHeight: 44),
          alignment: Alignment.center,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          decoration: BoxDecoration(
            color: selected ? c : AppColors.surface,
            borderRadius: BorderRadius.circular(22),
            border: Border.all(color: selected ? c : AppColors.border),
          ),
          child: Text(label,
              style: TextStyle(
                color: selected ? AppColors.onPrimary : AppColors.inkSoft,
                fontWeight: FontWeight.w700,
                fontSize: 13,
              )),
        ),
      ),
    );
  }
}

class _EntryCard extends StatelessWidget {
  const _EntryCard({required this.entry});
  final PassportEntry entry;

  @override
  Widget build(BuildContext context) {
    final verified = AppServices.passport.verify(entry);
    return AppCard(
      margin: const EdgeInsets.only(bottom: 12),
      onTap: () => context.push(PassportDetailScreen(entryId: entry.id)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              IconBadge(
                  icon: entry.status.icon, color: entry.status.color, size: 40),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(entry.title,
                        style: const TextStyle(
                            fontWeight: FontWeight.w800, fontSize: 15)),
                    const SizedBox(height: 2),
                    Row(
                      children: [
                        Text('${entry.vehicle.title} ',
                            style: TextStyle(
                                color: AppColors.inkSoft, fontSize: 13)),
                        PlateBadge(entry.vehicle.plate),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              Pill(
                  label: entry.status.label,
                  color: entry.status.color,
                  dense: true),
              Pill(label: entry.id, color: AppColors.inkSoft, dense: true),
              for (final c in entry.codes)
                Pill(label: c, color: AppColors.danger, dense: true),
              Pill(
                label: verified ? 'Chain verified' : 'Chain broken',
                color: verified ? AppColors.success : AppColors.danger,
                icon:
                    verified ? Icons.verified_rounded : Icons.gpp_bad_outlined,
                dense: true,
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            'Opened ${Fmt.date(entry.openedAt)} · ${entry.records.length} records · ${entry.evidenceCount} evidence',
            style: TextStyle(fontSize: 12.5, color: AppColors.muted),
          ),
        ],
      ),
    );
  }
}
