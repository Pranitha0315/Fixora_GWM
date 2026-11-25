import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/route_names.dart';
import '../../../../app/theme/app_colors.dart';
import '../../../../core/di/app_services.dart';
import '../../../../core/widgets/warm_icon_button.dart';
import '../../../jobs/domain/job_entities.dart';
import '../../../jobs/presentation/widgets/job_card.dart';
import '../../../shell/presentation/main_shell.dart';

/// Home: greeting, job search, filter pills and today's jobs as soft cards.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _search = TextEditingController();
  String _pill = 'All';

  @override
  void initState() {
    super.initState();
    AppServices.jobs.addListener(_refresh);
    AppServices.notifications.addListener(_refresh);
    AppServices.auth.addListener(_refresh);
  }

  @override
  void dispose() {
    AppServices.jobs.removeListener(_refresh);
    AppServices.notifications.removeListener(_refresh);
    AppServices.auth.removeListener(_refresh);
    _search.dispose();
    super.dispose();
  }

  void _refresh() {
    if (mounted) setState(() {});
  }

  bool _matches(Job j) {
    final q = _search.text.trim().toLowerCase();
    if (_pill == 'Active' && !j.status.isActive) return false;
    if (_pill == 'Done' && j.status.isActive) return false;
    if (q.isEmpty) return true;
    return j.vehicleReg.toLowerCase().contains(q) ||
        j.summary.toLowerCase().contains(q) ||
        j.token.toLowerCase().contains(q);
  }

  @override
  Widget build(BuildContext context) {
    final user = AppServices.auth.user;
    final jobsCtrl = AppServices.jobs;
    final current = jobsCtrl.currentJob;
    final sos = AppServices.sos.open;
    final onDuty = AppServices.auth.onDuty;
    final active = jobsCtrl.all.where((j) => j.status.isActive).length;
    final today = [
      ...jobsCtrl.queue.where(_matches),
      ...jobsCtrl.finished.where(_matches),
    ];

    return Scaffold(
      backgroundColor: AppColors.surface,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Hi, ${user?.name ?? user?.employeeCode ?? 'Mechanic'}',
                        style: TextStyle(
                          color: AppColors.ink,
                          fontSize: 22,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        onDuty ? 'On duty · $active active jobs' : 'Off duty',
                        style: TextStyle(color: AppColors.body),
                      ),
                    ],
                  ),
                ),
                const _ProfileTabButton(),
                WarmIconButton(
                  icon: Icons.notifications_none_rounded,
                  label: 'Alerts',
                  badge: AppServices.notifications.unread,
                  onTap: () => MainShell.openAlerts(context),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                _StatCard(label: 'Active', value: '$active'),
                const SizedBox(width: 10),
                _StatCard(
                  label: 'Current',
                  value: current?.token ?? '—',
                ),
                const SizedBox(width: 10),
                _StatCard(label: 'SOS', value: '${sos.length}'),
              ],
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _search,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                hintText: 'Search today\'s jobs',
                prefixIcon: Icon(Icons.search, color: AppColors.body),
                filled: true,
                fillColor: AppColors.surfaceElevated,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: BorderSide(color: AppColors.outline),
                ),
              ),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              children: [
                for (final pill in const ['All', 'Active', 'Done'])
                  ChoiceChip(
                    label: Text(pill),
                    selected: _pill == pill,
                    onSelected: (_) => setState(() => _pill = pill),
                    selectedColor: AppColors.primary.withValues(alpha: 0.18),
                    labelStyle: TextStyle(
                      color: _pill == pill ? AppColors.primary : AppColors.body,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 16),
            Text(
              'Today\'s jobs',
              style: TextStyle(
                color: AppColors.ink,
                fontWeight: FontWeight.w700,
                fontSize: 16,
              ),
            ),
            const SizedBox(height: 10),
            if (today.isEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 32),
                child: Center(
                  child: Text(
                    'No jobs for this filter.',
                    style: TextStyle(color: AppColors.body),
                  ),
                ),
              )
            else
              for (final job in today) ...[
                JobCard(
                  job: job,
                  onTap: () =>
                      context.push(RouteNames.jobDetailsPath(job.id)),
                ),
                const SizedBox(height: 10),
              ],
          ],
        ),
      ),
    );
  }
}

class _ProfileTabButton extends ConsumerWidget {
  const _ProfileTabButton();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return WarmIconButton(
      icon: Icons.person_outline_rounded,
      label: 'Profile',
      onTap: () => ref.read(shellTabProvider.notifier).setIndex(4),
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
        decoration: BoxDecoration(
          color: AppColors.surfaceElevated,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.outline),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: TextStyle(color: AppColors.body, fontSize: 12)),
            const SizedBox(height: 4),
            Text(
              value,
              style: TextStyle(
                color: AppColors.ink,
                fontWeight: FontWeight.w700,
                fontSize: 16,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
