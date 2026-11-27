import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../app/router/route_names.dart';
import '../../../../app/theme/app_colors.dart';
import '../../../../app/theme/app_typography.dart';
import '../../../../core/di/app_services.dart';
import '../../../../core/utils/nav.dart';
import '../../../../core/widgets/app_card.dart';
import '../../../../core/widgets/common.dart';
import '../../../../core/widgets/rev_common.dart' show EmptyState;
import '../../../shell/presentation/main_shell.dart';
import '../../../jobs/domain/job_entities.dart';
import '../providers/fixproof_provider.dart';

/// FixProof tab: start inspections, finish AI drafts, see published reports.
class FixProofHubScreen extends ConsumerWidget {
  const FixProofHubScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final states = ref.watch(reportStateProvider);
    ReportState stateOf(Job j) => states[j.id] ?? ReportState.notStarted;

    return ListenableBuilder(
      listenable: AppServices.jobs,
      builder: (context, _) {
        final jobs = AppServices.jobs.all;
        final toInspect = jobs.where((j) => j.status.isActive && stateOf(j) == ReportState.notStarted).toList();
        final drafts = jobs.where((j) => stateOf(j) == ReportState.draft).toList();
        final published = jobs.where((j) => stateOf(j) == ReportState.published).toList();

        return SafeArea(
          bottom: false,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
            children: [
              Text('FixProof', style: AppText.display),
              const SizedBox(height: 4),
              Text('Photo-proof inspection with AI voice reports', style: AppText.body.copyWith(color: AppColors.muted)),
              const SizedBox(height: 16),
              const _HowItWorks(),
              if (drafts.isNotEmpty) ...[
                const SectionHeader(title: 'Drafts to confirm'),
                for (final j in drafts)
                  _ReportTile(
                    job: j,
                    subtitle: 'AI draft ready · check and publish',
                    icon: Icons.edit_note_rounded,
                    tone: AppColors.warningSoft,
                    iconColor: AppColors.warning,
                    route: RouteNames.reportReview,
                  ),
              ],
              const SectionHeader(title: 'Needs inspection'),
              if (toInspect.isEmpty)
                AppCard(
                  child: EmptyState(
                    compact: true,
                    icon: Icons.verified_outlined,
                    title: 'All vehicles inspected',
                    message: jobs.any((j) => j.status.isActive)
                        ? 'Every open job already has its photo proof.'
                        : 'No open jobs yet. New cars from the manager will show here.',
                    actionLabel: 'Go to my jobs',
                    actionIcon: Icons.handyman_outlined,
                    onAction: () => MainShell.switchTab(context, MainShell.jobs),
                  ),
                )
              else ...[
                // The mechanic picks which car to inspect: every car has its own
                // Start button, and "Choose vehicle" searches the whole list.
                for (final (i, j) in toInspect.take(_maxListed).indexed)
                  _ReportTile(
                    job: j,
                    subtitle: i == 0 ? 'Next · ${j.serviceType}' : j.serviceType,
                    icon: Icons.photo_camera_rounded,
                    tone: AppColors.primarySoft,
                    iconColor: AppColors.primaryStrong,
                    route: RouteNames.inspectionCapture,
                    cta: 'Start',
                  ),
                OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                  onPressed: () => _chooseVehicle(context, toInspect),
                  icon: const Icon(Icons.directions_car_filled_outlined),
                  label: Text('Choose vehicle (${toInspect.length})'),
                ),
              ],
              const SectionHeader(title: 'Published'),
              if (published.isEmpty)
                AppCard(
                  child: EmptyState(
                    compact: true,
                    icon: Icons.photo_library_outlined,
                    title: 'No reports published yet',
                    message: 'Finished reports appear here once the customer can see them.',
                  ),
                ),
              for (final j in published)
                _ReportTile(
                  job: j,
                  subtitle: 'Visible to ${j.customer.name}',
                  icon: Icons.verified_rounded,
                  tone: AppColors.successSoft,
                  iconColor: AppColors.success,
                  route: RouteNames.jobDetails,
                ),
            ],
          ),
        );
      },
    );
  }
}

const _maxListed = 7;

/// Lets the mechanic search every open car and pick the one to inspect.
Future<void> _chooseVehicle(BuildContext context, List<Job> candidates) async {
  final picked = await showModalBottomSheet<Job>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => _VehiclePickerSheet(candidates: candidates),
  );
  if (picked == null || !context.mounted) return;
  context.pushRoute(RouteNames.inspectionCapture, extra: picked.id);
}

class _VehiclePickerSheet extends StatefulWidget {
  const _VehiclePickerSheet({required this.candidates});
  final List<Job> candidates;

  @override
  State<_VehiclePickerSheet> createState() => _VehiclePickerSheetState();
}

class _VehiclePickerSheetState extends State<_VehiclePickerSheet> {
  final _search = TextEditingController();

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final q = _search.text.trim().toLowerCase();
    final list = widget.candidates.where((j) {
      if (q.isEmpty) return true;
      return j.vehicle.plate.toLowerCase().contains(q) ||
          j.vehicle.title.toLowerCase().contains(q) ||
          j.customer.name.toLowerCase().contains(q) ||
          j.id.toLowerCase().contains(q);
    }).toList();
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(16, 0, 16, 16 + MediaQuery.viewInsetsOf(context).bottom),
        child: SizedBox(
          height: MediaQuery.sizeOf(context).height * 0.6,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Choose vehicle to inspect', style: AppText.title),
              const SizedBox(height: 10),
              TextField(
                controller: _search,
                onChanged: (_) => setState(() {}),
                decoration: const InputDecoration(
                  hintText: 'Search plate, vehicle or customer',
                  prefixIcon: Icon(Icons.search_rounded),
                ),
              ),
              const SizedBox(height: 10),
              Expanded(
                child: list.isEmpty
                    ? Center(child: Text('No vehicle matches "$q"', style: AppText.body))
                    : ListView.separated(
                        itemCount: list.length,
                        separatorBuilder: (_, __) => const Divider(height: 1),
                        itemBuilder: (context, i) {
                          final j = list[i];
                          return ListTile(
                            contentPadding: EdgeInsets.zero,
                            leading: Icon(Icons.directions_car_filled_outlined, color: AppColors.primaryStrong),
                            title: Text('${j.vehicle.title} · ${j.vehicle.plate}', style: AppText.bodyStrong),
                            subtitle: Text('${j.customer.name} · ${j.serviceType}', style: AppText.caption),
                            trailing: const Icon(Icons.chevron_right_rounded),
                            onTap: () => Navigator.of(context).pop(j),
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _HowItWorks extends StatelessWidget {
  const _HowItWorks();

  @override
  Widget build(BuildContext context) {
    Widget step(String n, String text) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Row(
            children: [
              CircleAvatar(
                radius: 15,
                backgroundColor: AppColors.surface,
                child: Text(n, style: AppText.label.copyWith(color: AppColors.primaryStrong, fontWeight: FontWeight.w800)),
              ),
              const SizedBox(width: 12),
              Expanded(child: Text(text, style: AppText.body.copyWith(color: AppColors.ink))),
            ],
          ),
        );
    return AppCard(
      color: AppColors.primarySoft,
      borderColor: AppColors.primaryBorder,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          step('1', 'Shoot photos & video'),
          step('2', 'Speak in Tamil'),
          step('3', 'AI writes the draft'),
          step('4', 'You check & publish'),
        ],
      ),
    );
  }
}

class _ReportTile extends StatelessWidget {
  const _ReportTile({
    required this.job,
    required this.subtitle,
    required this.icon,
    required this.tone,
    required this.iconColor,
    required this.route,
    this.cta,
  });

  final Job job;
  final String subtitle;
  final IconData icon;
  final Color tone;
  final Color iconColor;
  final String route;
  final String? cta;

  @override
  Widget build(BuildContext context) {
    void open() => context.pushRoute(route, extra: job.id);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: AppCard(
        onTap: open,
        child: Row(
          children: [
            IconBox(icon: icon, background: tone, foreground: iconColor),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      PlateBadge(plate: job.vehicle.plate),
                      const SizedBox(width: 8),
                      Text('#${job.token}', style: AppText.caption),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text('${job.vehicle.title} ${job.vehicle.year}', style: AppText.bodyStrong),
                  Text(subtitle, style: AppText.caption),
                ],
              ),
            ),
            if (cta != null)
              FilledButton(
                style: FilledButton.styleFrom(minimumSize: const Size(72, 44)),
                onPressed: open,
                child: Text(cta!),
              )
            else
              Icon(Icons.chevron_right_rounded, color: AppColors.muted),
          ],
        ),
      ),
    );
  }
}
