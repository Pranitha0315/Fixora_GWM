import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/route_names.dart';
import '../../../../app/theme/app_colors.dart';
import '../../../../core/di/app_services.dart';
import '../../../jobs/domain/job_entities.dart';
import '../../data/queue_refresh.dart';
import '../widgets/bay_job_card.dart';

/// Today queue board — search, status chips, bay cards.
/// Pull-to-refresh + SignalR (`job*` / `queue*`) reload assignments after manager reassignment.
class QueueBoardScreen extends StatefulWidget {
  const QueueBoardScreen({super.key, this.asTab = false});

  final bool asTab;

  @override
  State<QueueBoardScreen> createState() => _QueueBoardScreenState();
}

/// Alias so Jobs tab / older imports keep working.
typedef QueueScreen = QueueBoardScreen;

class _QueueBoardScreenState extends State<QueueBoardScreen> {
  final _search = TextEditingController();
  JobStatus? _filter;

  @override
  void initState() {
    super.initState();
    AppServices.jobs.addListener(_onJobs);
  }

  @override
  void dispose() {
    AppServices.jobs.removeListener(_onJobs);
    _search.dispose();
    super.dispose();
  }

  void _onJobs() {
    if (mounted) setState(() {});
  }

  bool _matches(Job j) {
    final q = _search.text.trim().toLowerCase();
    if (_filter != null && j.status != _filter) return false;
    if (q.isEmpty) return true;
    return j.vehicleReg.toLowerCase().contains(q) ||
        j.summary.toLowerCase().contains(q) ||
        j.token.toLowerCase().contains(q) ||
        j.customerName.toLowerCase().contains(q) ||
        (j.bay?.toLowerCase().contains(q) ?? false);
  }

  Future<void> _onRefresh() => QueueRefresh.pull();

  @override
  Widget build(BuildContext context) {
    final ctrl = AppServices.jobs;
    final all = [...ctrl.queue, ...ctrl.finished].where(_matches).toList();
    final bayList =
        all.where((j) => j.bay != null && j.bay!.isNotEmpty).toList()
          ..sort((a, b) => (a.bay ?? '').compareTo(b.bay ?? ''));
    final noBay = all.where((j) => j.bay == null || j.bay!.isEmpty).toList();

    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(
        title: Text(widget.asTab ? 'Jobs' : 'Today queue'),
        backgroundColor: AppColors.surface,
        foregroundColor: AppColors.ink,
        automaticallyImplyLeading: !widget.asTab,
      ),
      body: RefreshIndicator(
        color: AppColors.primary,
        onRefresh: _onRefresh,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
          children: [
            TextField(
              controller: _search,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                hintText: 'Search bay, reg, customer…',
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
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  _FilterChip(
                    label: 'All',
                    selected: _filter == null,
                    onTap: () => setState(() => _filter = null),
                  ),
                  _FilterChip(
                    label: 'Working',
                    selected: _filter == JobStatus.inProgress,
                    onTap: () =>
                        setState(() => _filter = JobStatus.inProgress),
                  ),
                  _FilterChip(
                    label: 'Waiting',
                    selected: _filter == JobStatus.waiting,
                    onTap: () => setState(() => _filter = JobStatus.waiting),
                  ),
                  _FilterChip(
                    label: 'Review',
                    selected: _filter == JobStatus.awaitingApproval,
                    onTap: () => setState(
                      () => _filter = JobStatus.awaitingApproval,
                    ),
                  ),
                  _FilterChip(
                    label: 'Done',
                    selected: _filter == JobStatus.completed,
                    onTap: () =>
                        setState(() => _filter = JobStatus.completed),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            Text(
              '${all.length} jobs · ${bayList.length} on bay',
              style: TextStyle(color: AppColors.body, fontSize: 12),
            ),
            if (bayList.isNotEmpty) ...[
              const SizedBox(height: 18),
              Text(
                'Bay cards',
                style: TextStyle(
                  color: AppColors.ink,
                  fontWeight: FontWeight.w700,
                  fontSize: 16,
                ),
              ),
              const SizedBox(height: 10),
              for (final job in bayList) ...[
                BayJobCard(
                  job: job,
                  onTap: () =>
                      context.push(RouteNames.jobDetailsPath(job.id)),
                ),
                const SizedBox(height: 10),
              ],
            ],
            if (noBay.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                'Unassigned bay',
                style: TextStyle(
                  color: AppColors.ink,
                  fontWeight: FontWeight.w700,
                  fontSize: 16,
                ),
              ),
              const SizedBox(height: 10),
              for (final job in noBay) ...[
                BayJobRowCard(
                  job: job,
                  onTap: () =>
                      context.push(RouteNames.jobDetailsPath(job.id)),
                ),
                const SizedBox(height: 10),
              ],
            ],
            if (all.isEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 48),
                child: Center(
                  child: Text(
                    'No jobs match your filters.',
                    style: TextStyle(color: AppColors.body),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Compact bay row used under / beside bay cards.
class BayJobRowCard extends StatelessWidget {
  const BayJobRowCard({
    super.key,
    required this.job,
    required this.onTap,
  });

  final Job job;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surfaceElevated,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppColors.outline),
          ),
          child: Row(
            children: [
              Icon(Icons.garage_outlined, color: AppColors.primary, size: 20),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  job.bay ?? 'No bay',
                  style: TextStyle(
                    color: AppColors.ink,
                    fontWeight: FontWeight.w600,
                    fontSize: 13,
                  ),
                ),
              ),
              Text(
                job.status.label,
                style: TextStyle(color: AppColors.body, fontSize: 12),
              ),
              const SizedBox(width: 4),
              Icon(Icons.chevron_right, color: AppColors.body, size: 20),
            ],
          ),
        ),
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: ChoiceChip(
        label: Text(label),
        selected: selected,
        onSelected: (_) => onTap(),
        selectedColor: AppColors.primary.withValues(alpha: 0.2),
        labelStyle: TextStyle(
          color: selected ? AppColors.primary : AppColors.body,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
