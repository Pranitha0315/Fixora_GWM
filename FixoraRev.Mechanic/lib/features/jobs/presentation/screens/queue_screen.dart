import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/route_names.dart';
import '../../../../app/theme/app_colors.dart';
import '../../../../core/di/app_services.dart';
import '../../domain/job_entities.dart';
import '../widgets/job_card.dart';

enum _Group { inProgress, upNext, completed }

/// Jobs tab — search, status chips and the live queue grouped into
/// In progress · Up next · Completed.
class QueueScreen extends StatefulWidget {
  const QueueScreen({super.key, this.asTab = false});

  final bool asTab;

  @override
  State<QueueScreen> createState() => _QueueScreenState();
}

class _QueueScreenState extends State<QueueScreen> {
  final _search = TextEditingController();
  JobStatus? _filter;

  static bool _isWorking(Job j) =>
      j.status == JobStatus.diagnosing || j.status == JobStatus.inProgress;

  static _Group _groupOf(Job j) {
    if (!j.status.isActive) return _Group.completed;
    if (_isWorking(j)) return _Group.inProgress;
    return _Group.upNext;
  }

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
        j.customerName.toLowerCase().contains(q);
  }

  @override
  Widget build(BuildContext context) {
    final ctrl = AppServices.jobs;
    final all = [...ctrl.queue, ...ctrl.finished].where(_matches).toList();

    final inProgress = all.where((j) => _groupOf(j) == _Group.inProgress);
    final upNext = all.where((j) => _groupOf(j) == _Group.upNext);
    final completed = all.where((j) => _groupOf(j) == _Group.completed);

    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(
        title: Text(widget.asTab ? 'Jobs' : 'Jobs queue'),
        backgroundColor: AppColors.surface,
        foregroundColor: AppColors.ink,
        automaticallyImplyLeading: !widget.asTab,
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          TextField(
            controller: _search,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              hintText: 'Search assigned jobs',
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
                  onTap: () => setState(() => _filter = JobStatus.inProgress),
                ),
                _FilterChip(
                  label: 'Waiting',
                  selected: _filter == JobStatus.waiting,
                  onTap: () => setState(() => _filter = JobStatus.waiting),
                ),
                _FilterChip(
                  label: 'Review',
                  selected: _filter == JobStatus.awaitingApproval,
                  onTap: () =>
                      setState(() => _filter = JobStatus.awaitingApproval),
                ),
                _FilterChip(
                  label: 'Done',
                  selected: _filter == JobStatus.completed,
                  onTap: () => setState(() => _filter = JobStatus.completed),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Text(
            '${all.length} jobs · ${inProgress.length} working · ${upNext.length} up next',
            style: TextStyle(color: AppColors.body, fontSize: 12),
          ),
          _section('In progress', inProgress),
          _section('Up next', upNext),
          _section('Completed', completed),
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
    );
  }

  Widget _section(String title, Iterable<Job> jobs) {
    final list = jobs.toList();
    if (list.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 18),
        Text(
          title,
          style: TextStyle(
            color: AppColors.ink,
            fontWeight: FontWeight.w700,
            fontSize: 16,
          ),
        ),
        const SizedBox(height: 10),
        for (final job in list) ...[
          JobCard(
            job: job,
            onTap: () => context.push(RouteNames.jobDetailsPath(job.id)),
          ),
          const SizedBox(height: 10),
        ],
      ],
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
