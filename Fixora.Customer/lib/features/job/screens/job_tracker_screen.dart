import 'package:flutter/material.dart';

import '../../../core/navigation/nav.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/media.dart';
import '../../../data/models/models.dart';
import '../../../data/repositories/job_store.dart';
import 'approval_request_screen.dart';
import 'diagnosis_report_screen.dart';
import 'view_photos_screen.dart';

/// "Estimate & Approval" hub with Service / Live Data / Media tabs.
class JobTrackerScreen extends StatefulWidget {
  final int initialTab;
  const JobTrackerScreen({super.key, this.initialTab = 0});

  @override
  State<JobTrackerScreen> createState() => _JobTrackerScreenState();
}

class _JobTrackerScreenState extends State<JobTrackerScreen> {
  late int _tab = widget.initialTab;

  @override
  Widget build(BuildContext context) {
    final store = JobStore.instance;
    return ListenableBuilder(
      listenable: store,
      builder: (context, _) {
        final awaiting =
            store.status == JobStatus.awaitingApproval || store.status == JobStatus.changesRequested;
        return Scaffold(
          backgroundColor: AppColors.bg,
          appBar: AppBar(
            title: Text(awaiting ? 'Estimate & Approval' : 'Job Details'),
            backgroundColor: AppColors.bg,
            foregroundColor: AppColors.navy,
            elevation: 0,
          ),
          body: ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
            children: [
              Container(
                padding: const EdgeInsets.fromLTRB(14, 16, 14, 16),
                decoration: BoxDecoration(
                  color: AppColors.surfaceSolid,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: AppColors.border),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 44,
                          height: 44,
                          decoration: BoxDecoration(
                            color: AppColors.primarySoft,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Icon(Icons.assignment_outlined, color: AppColors.link),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Estimate Details', style: AppText.h2),
                              Text(
                                'Review the service estimate and approve to proceed.',
                                style: AppText.muted.copyWith(fontSize: 13),
                              ),
                            ],
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                          decoration: BoxDecoration(
                            color: AppColors.primarySofter,
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Text(
                            store.jobId,
                            style: TextStyle(color: AppColors.link, fontWeight: FontWeight.w800, fontSize: 12),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: Row(
                        children: [
                          for (final e in const [
                            (0, 'Service', Icons.build_outlined),
                            (1, 'Live Data', Icons.show_chart_rounded),
                            (2, 'Media', Icons.smart_display_outlined),
                          ])
                            Padding(
                              padding: const EdgeInsets.only(right: 8),
                              child: ChoiceChip(
                                avatar: Icon(e.$3, size: 16),
                                label: Text(e.$2),
                                selected: _tab == e.$1,
                                onSelected: (_) => setState(() => _tab = e.$1),
                              ),
                            ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 14),
                    AnimatedSwitcher(
                      duration: const Duration(milliseconds: 300),
                      child: KeyedSubtree(
                        key: ValueKey(_tab),
                        child: switch (_tab) {
                          0 => const _ServiceTab(),
                          1 => const _LiveTab(),
                          _ => const _MediaTab(),
                        },
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _ServiceTab extends StatelessWidget {
  const _ServiceTab();

  @override
  Widget build(BuildContext context) {
    final store = JobStore.instance;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Service overview', style: AppText.h3),
        const SizedBox(height: 8),
        Text(store.statusLabel, style: AppText.muted),
        const SizedBox(height: 14),
        SizedBox(
          height: 48,
          child: OutlinedButton.icon(
            onPressed: () => context.push(const DiagnosisReportScreen()),
            icon: const Icon(Icons.assignment_outlined),
            label: const Text('Open Diagnosis Report'),
            style: OutlinedButton.styleFrom(
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            ),
          ),
        ),
        const SizedBox(height: 10),
        SizedBox(
          height: 48,
          child: FilledButton.icon(
            onPressed: () => context.push(const ApprovalRequestScreen()),
            icon: const Icon(Icons.assignment_turned_in_outlined),
            label: const Text('Review & Approve Estimate'),
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.primary,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            ),
          ),
        ),
      ],
    );
  }
}

class _LiveTab extends StatelessWidget {
  const _LiveTab();

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Live readings', style: AppText.h3),
        const SizedBox(height: 8),
        Text('Open the diagnosis report for freeze-frame OBD data.', style: AppText.muted),
        const SizedBox(height: 14),
        SizedBox(
          height: 48,
          child: FilledButton.icon(
            onPressed: () => context.push(const DiagnosisReportScreen()),
            icon: const Icon(Icons.show_chart_rounded),
            label: const Text('View Live Data'),
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.primary,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            ),
          ),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------- Media tab

class _MediaTab extends StatelessWidget {
  const _MediaTab();

  @override
  Widget build(BuildContext context) {
    final store = JobStore.instance;
    final photos = store.media.where((m) => m.kind == MediaKind.photo).toList();
    final videos = store.media.where((m) => m.kind == MediaKind.video).toList();
    final before = store.media.firstWhere(
      (m) => m.stage == MediaStage.before,
      orElse: () => photos.isNotEmpty
          ? photos.first
          : const MediaItem(
              asset: '',
              kind: MediaKind.photo,
              stage: MediaStage.before,
              caption: 'Before',
            ),
    );
    final after = store.media.firstWhere(
      (m) => m.stage == MediaStage.after,
      orElse: () => photos.isNotEmpty
          ? photos.last
          : const MediaItem(
              asset: '',
              kind: MediaKind.photo,
              stage: MediaStage.after,
              caption: 'After',
            ),
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Text('Media', style: AppText.h3),
            const Spacer(),
            Text(store.currentStepLabel, style: AppText.small.copyWith(color: AppColors.link, fontWeight: FontWeight.w700)),
          ],
        ),
        const SizedBox(height: 10),
        _sectionTitle(
          'Repair Photos (${photos.length})',
          Icons.photo_outlined,
          action: 'View All',
          onAction: () => context.push(const ViewPhotosScreen()),
        ),
        SizedBox(
          height: 72,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            physics: const BouncingScrollPhysics(),
            itemCount: photos.length,
            separatorBuilder: (_, __) => const SizedBox(width: 8),
            itemBuilder: (_, i) => SizedBox(
              width: 76,
              child: MediaTile(
                item: photos[i],
                radius: 12,
                showBadge: false,
                onTap: () => PhotoViewerScreen.open(context, photos, i),
              ),
            ),
          ),
        ),
        _sectionTitle(
          'Repair Videos (${videos.length})',
          Icons.smart_display_outlined,
          action: 'View All',
          onAction: () => context.push(const ViewPhotosScreen()),
        ),
        Row(
          children: [
            for (var i = 0; i < videos.length && i < 2; i++) ...[
              if (i > 0) const SizedBox(width: 10),
              Expanded(
                child: AspectRatio(
                  aspectRatio: 1.65,
                  child: MediaTile(
                    item: videos[i],
                    onTap: () => PhotoViewerScreen.open(context, videos, i),
                  ),
                ),
              ),
            ],
            if (videos.isEmpty)
              Expanded(
                child: Text('No videos yet.', style: AppText.muted),
              ),
          ],
        ),
        _sectionTitle('Before & After', Icons.compare_outlined),
        Row(
          children: [
            Expanded(
              child: AspectRatio(
                aspectRatio: 1.45,
                child: MediaTile(
                  item: before,
                  showExpand: false,
                  onTap: () => PhotoViewerScreen.open(context, [before, after], 0),
                ),
              ),
            ),
            Container(
              margin: const EdgeInsets.symmetric(horizontal: 6),
              width: 26,
              height: 26,
              decoration: BoxDecoration(
                color: AppColors.surfaceSolid,
                shape: BoxShape.circle,
                border: Border.all(color: AppColors.border),
              ),
              child: Icon(Icons.arrow_forward_rounded, size: 16, color: AppColors.link),
            ),
            Expanded(
              child: AspectRatio(
                aspectRatio: 1.45,
                child: MediaTile(
                  item: after,
                  showExpand: false,
                  onTap: () => PhotoViewerScreen.open(context, [before, after], 1),
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _sectionTitle(String title, IconData icon, {String? action, VoidCallback? onAction}) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(0, 14, 0, 10),
      child: Row(
        children: [
          Icon(icon, size: 18, color: AppColors.link),
          const SizedBox(width: 8),
          Expanded(child: Text(title, style: AppText.h3.copyWith(fontSize: 14.5))),
          if (action != null)
            TextButton(
              onPressed: onAction,
              child: Text(action, style: TextStyle(color: AppColors.link, fontWeight: FontWeight.w700)),
            ),
        ],
      ),
    );
  }
}
