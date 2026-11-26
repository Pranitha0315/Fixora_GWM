import 'package:flutter/material.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../core/backend/mechanic_backend.dart';
import '../../../../core/di/app_services.dart';
import '../../../../core/utils/formatters.dart';
import '../../../../core/utils/nav.dart';
import '../../../../core/widgets/rev_common.dart' show EmptyState;
import '../../../../core/widgets/rev_ui.dart';
import '../../../home/presentation/screens/home_screen.dart' show showJobQuickActions;
import '../../../inventory/domain/part.dart';
import '../../../jobs/domain/job_entities.dart';
import '../../../jobs/presentation/screens/job_detail_screen.dart';
import '../../../shell/presentation/main_shell.dart';

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

enum _Group { inProgress, upNext, completed }

class _QueueBoardScreenState extends State<QueueBoardScreen> {
  final _search = TextEditingController();
  int _chip = 0; // All · Pending · In progress · Review · Done
  bool _sortByPriority = true;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  static bool _isPending(Job j) => j.status == JobStatus.waiting || j.status == JobStatus.approved;
  static bool _isWorking(Job j) => j.status == JobStatus.diagnosing || j.status == JobStatus.inProgress;
  static bool _isReview(Job j) => j.status == JobStatus.awaitingApproval || j.status == JobStatus.qualityCheck;

  static _Group _groupOf(Job j) {
    if (!j.status.isActive) return _Group.completed;
    if (_isWorking(j)) return _Group.inProgress;
    return _Group.upNext;
  }

  bool _matchesChip(Job j) => switch (_chip) {
        1 => _isPending(j),
        2 => _isWorking(j),
        3 => _isReview(j),
        4 => !j.status.isActive,
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
        final all = [...ctrl.queue, ...ctrl.finished];
        final counts = [
          all.length,
          all.where(_isPending).length,
          all.where(_isWorking).length,
          all.where(_isReview).length,
          all.where((j) => !j.status.isActive).length,
        ];
        final visible = all.where((j) => _matchesChip(j) && _matchesSearch(j)).toList();

        final upNext = visible.where((j) => _groupOf(j) == _Group.upNext).toList();
        if (!_sortByPriority) {
          upNext.sort((a, b) => a.slotTime.compareTo(b.slotTime));
        }
        final groups = <(_Group, String, List<Job>)>[
          (_Group.inProgress, 'In progress', visible.where((j) => _groupOf(j) == _Group.inProgress).toList()),
          (_Group.upNext, 'Up next', upNext),
          (_Group.completed, 'Completed', visible.where((j) => _groupOf(j) == _Group.completed).toList()),
        ];

        final page = RevTabPage(
          title: 'My jobs',
          subtitle: '${all.length} jobs today · live queue',
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
                'Done ${counts[4]}',
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

/// Bay card used on the today queue board.
class BayJobRowCard extends StatelessWidget {
  const BayJobRowCard({super.key, required this.job});
  final Job job;

  static RevTone toneFor(JobStatus s) => switch (s) {
        JobStatus.waiting || JobStatus.approved => RevTone.blue,
        JobStatus.diagnosing || JobStatus.inProgress => RevTone.orange,
        JobStatus.awaitingApproval || JobStatus.qualityCheck => RevTone.amber,
        JobStatus.completed || JobStatus.parked => RevTone.green,
      };

  static String shortStatus(JobStatus s) => switch (s) {
        JobStatus.waiting || JobStatus.approved => 'Pending',
        JobStatus.diagnosing || JobStatus.inProgress => 'In progress',
        JobStatus.awaitingApproval || JobStatus.qualityCheck => 'Review',
        JobStatus.completed => 'Done',
        JobStatus.parked => 'Parked',
      };

  String _timeLine(DateTime? eta) {
    switch (job.status) {
      case JobStatus.inProgress:
        final pct = ((job.tasks.isEmpty ? job.status.progress : 0.5 + job.taskProgress * 0.4) * 100).round();
        return job.startedAt != null ? 'Started ${Fmt.time(job.startedAt!)} · $pct%' : 'In progress · $pct%';
      case JobStatus.diagnosing:
        return 'Diagnosing now';
      case JobStatus.awaitingApproval:
        return 'Waiting for customer';
      case JobStatus.qualityCheck:
        return 'Quality check';
      case JobStatus.completed:
        return job.completedAt != null ? 'Finished ${Fmt.time(job.completedAt!)}' : 'Finished';
      case JobStatus.parked:
        return 'Parked in Evidence Passport';
      case JobStatus.waiting:
      case JobStatus.approved:
        return eta != null ? 'ETA ${Fmt.time(eta)}' : 'Slot ${Fmt.time(job.slotTime)}';
    }
  }

  @override
  Widget build(BuildContext context) {
    final eta = AppServices.jobs.etaFor(job);
    final hasPassport = AppServices.passport.openFor(job.vehicle).isNotEmpty;
    final availability =
        job.estimate == null || !job.status.isActive ? null : AppServices.inventory.jobAvailability(job);

    final tags = <Widget>[
      if (job.priority == JobPriority.sos) const RevPill(label: 'SOS', tone: RevTone.red, icon: Icons.sos_rounded),
      if (job.priority == JobPriority.safety)
        const RevPill(label: 'Safety critical', tone: RevTone.red, icon: Icons.warning_amber_rounded),
      if (job.priority == JobPriority.returning)
        const RevPill(label: 'Returning issue', tone: RevTone.purple, icon: Icons.history_rounded),
      if (hasPassport) const RevPill(label: 'Passport', tone: RevTone.grey, icon: Icons.menu_book_outlined),
      if (availability == PartAvailability.blocked)
        const RevPill(label: 'Parts blocked', tone: RevTone.red, icon: Icons.inventory_2_outlined)
      else if (availability == PartAvailability.partial)
        const RevPill(label: 'Parts partly in', tone: RevTone.amber, icon: Icons.inventory_2_outlined),
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
