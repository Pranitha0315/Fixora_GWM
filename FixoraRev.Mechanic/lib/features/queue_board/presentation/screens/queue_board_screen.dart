import 'package:flutter/material.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../core/backend/mechanic_backend.dart';
import '../../../../core/di/app_services.dart';
import '../../../../core/utils/formatters.dart';
import '../../../../core/utils/nav.dart';
import '../../../../core/widgets/rev_common.dart' show EmptyState;
import '../../../../core/widgets/rev_ui.dart';
import '../../../home/presentation/screens/home_screen.dart' show showJobQuickActions;
import '../../../jobs/domain/job_entities.dart';
import '../../../jobs/presentation/screens/job_detail_screen.dart';
import '../../../shell/presentation/main_shell.dart';

/// Today queue board — search, status chips, job cards.
/// Pull-to-refresh + SignalR (`job*` / `queue*`) reload assignments after manager reassignment.
class QueueBoardScreen extends StatefulWidget {
  const QueueBoardScreen({super.key, this.asTab = false});

  final bool asTab;

  @override
  State<QueueBoardScreen> createState() => _QueueBoardScreenState();
}

/// Alias so Jobs tab / older imports keep working.
typedef QueueScreen = QueueBoardScreen;

enum _Group { inProgress, upNext, completed }

class _QueueBoardScreenState extends State<QueueBoardScreen> {
  final _search = TextEditingController();
  static const _maxShown = 7;
  int _chip = 0; // All · Pending · In progress · Review
  bool _sortByPriority = true;
  bool _showAll = false;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  static bool _isPending(Job j) => j.status == JobStatus.waiting;
  static bool _isWorking(Job j) => j.status == JobStatus.diagnosing || j.status == JobStatus.inProgress;
  static bool _isReview(Job j) => j.status == JobStatus.awaitingApproval;

  static _Group _groupOf(Job j) {
    if (!j.status.isActive) return _Group.completed;
    if (_isWorking(j)) return _Group.inProgress;
    return _Group.upNext;
  }

  // The board shows active jobs only (assigned to this mechanic). Finished jobs are not listed here.
  bool _matchesChip(Job j) => switch (_chip) {
        1 => _isPending(j),
        2 => _isWorking(j),
        3 => _isReview(j),
        _ => true,
      };

  bool _matchesSearch(Job j) {
    final q = _search.text.trim().toLowerCase();
    if (q.isEmpty) return true;
    return j.id.toLowerCase().contains(q) ||
        j.vehicle.plate.toLowerCase().contains(q) ||
        j.vehicle.title.toLowerCase().contains(q) ||
        j.customer.name.toLowerCase().contains(q) ||
        j.serviceType.toLowerCase().contains(q);
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: Listenable.merge([AppServices.jobs, AppServices.notifications, MechanicBackend.instance]),
      builder: (context, _) {
        final ctrl = AppServices.jobs;
        final all = ctrl.queue; // active jobs only
        final counts = [
          all.length,
          all.where(_isPending).length,
          all.where(_isWorking).length,
          all.where(_isReview).length,
        ];
        final visible = all.where((j) => _matchesChip(j) && _matchesSearch(j)).toList();

        final upNext = visible.where((j) => _groupOf(j) == _Group.upNext).toList();
        if (!_sortByPriority) {
          upNext.sort((a, b) => a.slotTime.compareTo(b.slotTime));
        }
        final fullGroups = <(_Group, String, List<Job>)>[
          (_Group.inProgress, 'In progress', visible.where((j) => _groupOf(j) == _Group.inProgress).toList()),
          (_Group.upNext, 'Up next', upNext),
        ];

        // The mechanic's history can run to dozens of cards. Show the first
        // [_maxShown] (work in hand first, then the waiting line) and keep the
        // rest behind "Show all".
        final capped = !_showAll && visible.length > _maxShown;
        var budget = capped ? _maxShown : visible.length;
        final groups = <(_Group, String, List<Job>)>[];
        for (final (group, title, jobs) in fullGroups) {
          final take = jobs.take(budget).toList();
          budget -= take.length;
          groups.add((group, title, take));
        }

        final page = RevTabPage(
          title: 'My jobs',
          subtitle: capped
              ? 'Showing $_maxShown of ${visible.length} jobs · live queue'
              : '${all.length} jobs · live queue',
          action: widget.asTab
              ? RevBell(
                  unread: AppServices.notifications.unread,
                  onTap: () => MainShell.openAlerts(context),
                )
              : null,
          children: [
            const SizedBox(height: 16),
            TextField(
              controller: _search,
              onChanged: (_) => setState(() {}),
              textInputAction: TextInputAction.search,
              style: TextStyle(fontSize: 15, color: AppColors.ink),
              decoration: InputDecoration(
                hintText: 'Search plate, vehicle or job no.',
                prefixIcon: const Icon(Icons.search_rounded),
                suffixIcon: _search.text.isEmpty
                    ? null
                    : IconButton(
                        tooltip: 'Clear search',
                        icon: const Icon(Icons.close_rounded),
                        onPressed: () => setState(_search.clear),
                      ),
                contentPadding: const EdgeInsets.symmetric(vertical: 14),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: BorderSide(color: AppColors.border, width: 1.5),
                ),
              ),
            ),
            const SizedBox(height: 12),
            RevChipRow(
              labels: [
                'All ${counts[0]}',
                'Pending ${counts[1]}',
                'In progress ${counts[2]}',
                'Review ${counts[3]}',
              ],
              selected: _chip,
              onSelected: (i) => setState(() => _chip = i),
            ),
            if (visible.isEmpty)
              all.isEmpty
                  ? EmptyState(
                      icon: Icons.car_repair_outlined,
                      title: 'No jobs in your queue',
                      message: 'When the manager assigns you a car it shows up here straight away.',
                      actionLabel: 'Refresh',
                      actionIcon: Icons.refresh_rounded,
                      onAction: MechanicBackend.instance.pullRefresh,
                    )
                  : EmptyState(
                      icon: Icons.search_off_rounded,
                      title: 'No jobs found',
                      message: _search.text.isEmpty
                          ? 'Nothing in this group right now.'
                          : 'No job matches "${_search.text.trim()}".',
                      actionLabel: 'Clear filters',
                      actionIcon: Icons.filter_alt_off_rounded,
                      onAction: () => setState(() {
                        _search.clear();
                        _chip = 0;
                      }),
                    ),
            for (final (group, title, jobs) in groups)
              if (jobs.isNotEmpty) ...[
                RevSection(
                  title,
                  top: 18,
                  action: group == _Group.upNext && jobs.length > 1
                      ? (_sortByPriority ? 'Sort: priority' : 'Sort: time')
                      : null,
                  onAction: () => setState(() => _sortByPriority = !_sortByPriority),
                ),
                for (final j in jobs) BayJobRowCard(job: j),
              ],
            if (visible.length > _maxShown)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: TextButton.icon(
                  onPressed: () => setState(() => _showAll = !_showAll),
                  icon: Icon(_showAll ? Icons.expand_less_rounded : Icons.expand_more_rounded),
                  label: Text(_showAll ? 'Show fewer' : 'Show all ${visible.length} jobs'),
                ),
              ),
            const SizedBox(height: 4),
            Text('Press and hold a job for quick actions · pull down to refresh.',
                textAlign: TextAlign.center, style: TextStyle(fontSize: 12.5, color: AppColors.muted)),
            const SizedBox(height: 2),
            Text('Times are estimates from the workshop queue and can change.',
                textAlign: TextAlign.center, style: TextStyle(fontSize: 12.5, color: AppColors.muted)),
          ],
        );

        final refreshable = RefreshIndicator(
          color: AppColors.primaryStrong,
          edgeOffset: MediaQuery.paddingOf(context).top,
          onRefresh: MechanicBackend.instance.pullRefresh,
          child: page,
        );
        if (widget.asTab) return refreshable;
        return Scaffold(
          body: refreshable,
          floatingActionButton: FloatingActionButton.small(
            tooltip: 'Back',
            onPressed: () => Navigator.of(context).maybePop(),
            child: const Icon(Icons.arrow_back_rounded),
          ),
          floatingActionButtonLocation: FloatingActionButtonLocation.startTop,
        );
      },
    );
  }
}

/// Job card used on the queue board.
class BayJobRowCard extends StatelessWidget {
  const BayJobRowCard({super.key, required this.job});
  final Job job;

  static RevTone toneFor(JobStatus s) => switch (s) {
        JobStatus.waiting => RevTone.blue,
        JobStatus.diagnosing || JobStatus.inProgress => RevTone.orange,
        JobStatus.awaitingApproval => RevTone.amber,
        JobStatus.completed => RevTone.green,
      };

  static String shortStatus(JobStatus s) => switch (s) {
        JobStatus.waiting => 'Pending',
        JobStatus.diagnosing || JobStatus.inProgress => 'In progress',
        JobStatus.awaitingApproval => 'Review',
        JobStatus.completed => 'Done',
      };

  String _timeLine(DateTime? eta) {
    if (job.paused) return 'Paused';
    switch (job.status) {
      case JobStatus.inProgress:
        final pct = (job.status.progress * 100).round();
        return job.startedAt != null ? 'Started ${Fmt.time(job.startedAt!)} · $pct%' : 'In progress · $pct%';
      case JobStatus.diagnosing:
        return 'Inspecting now';
      case JobStatus.awaitingApproval:
        return 'Waiting for manager review';
      case JobStatus.completed:
        return job.completedAt != null ? 'Finished ${Fmt.time(job.completedAt!)}' : 'Finished';
      case JobStatus.waiting:
        return eta != null ? 'ETA ${Fmt.time(eta)}' : 'Slot ${Fmt.time(job.slotTime)}';
    }
  }

  @override
  Widget build(BuildContext context) {
    final eta = AppServices.jobs.etaFor(job);

    final tags = <Widget>[
      if (job.priority == JobPriority.sos) const RevPill(label: 'SOS', tone: RevTone.red, icon: Icons.sos_rounded),
      if (job.priority == JobPriority.safety)
        const RevPill(label: 'Safety critical', tone: RevTone.red, icon: Icons.warning_amber_rounded),
      if (job.priority == JobPriority.returning)
        const RevPill(label: 'Returning issue', tone: RevTone.purple, icon: Icons.history_rounded),
    ];

    return GestureDetector(
      onLongPress: () => showJobQuickActions(context, job),
      child: RevCard(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.fromLTRB(12, 12, 10, 10),
        borderColor: job.priority == JobPriority.sos ? AppColors.danger.withValues(alpha: 0.6) : null,
        onTap: () => context.push(JobDetailScreen(jobId: job.id)),
        semanticLabel: '${job.vehicle.title}, ${job.id}, ${job.serviceType}, ${shortStatus(job.status)}, ${job.bay}',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CarCutout(job.vehicle.cutoutAsset, width: 82, height: 44),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              job.vehicle.title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.ink),
                            ),
                          ),
                          const SizedBox(width: 6),
                          RevPill(label: shortStatus(job.status), tone: toneFor(job.status)),
                        ],
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '${job.id} · ${job.serviceType}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 13.5, color: AppColors.body),
                      ),
                      Text(
                        '${job.vehicle.plate} · ${job.customer.name}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 12.5, color: AppColors.muted),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            if (tags.isNotEmpty) ...[
              const SizedBox(height: 8),
              Wrap(spacing: 6, runSpacing: 6, children: tags),
            ],
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 10),
              child: Divider(height: 1, color: AppColors.border),
            ),
            Row(
              children: [
                Icon(Icons.schedule_rounded, size: 19, color: AppColors.muted),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    _timeLine(eta),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: AppColors.body),
                  ),
                ),
                Icon(Icons.garage_outlined, size: 19, color: AppColors.muted),
                const SizedBox(width: 4),
                Text(job.bay, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: AppColors.body)),
                Icon(Icons.chevron_right_rounded, color: AppColors.body),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Compatibility name used by older Jobs-tab code.
typedef JobRowCard = BayJobRowCard;
