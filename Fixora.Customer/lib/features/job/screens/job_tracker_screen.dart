import 'package:flutter/material.dart';

import '../../../core/core.dart';
import '../widgets/job_widgets.dart';
import 'add_media_screen.dart';
import 'approval_request_screen.dart';
import 'diagnosis_report_screen.dart';
import 'estimate_price_screen.dart';
import 'invoice_screen.dart';
import 'repair_progress_screen.dart';
import 'request_changes_screen.dart';
import 'service_completed_screen.dart';
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
        final awaiting = store.status == JobStatus.awaitingApproval ||
            store.status == JobStatus.changesRequested;
        return FxPage(
          title: awaiting ? 'Estimate & Approval' : 'Job Details',
          children: [
            FadeSlide(child: _BayHeader(store: store)),
            const SizedBox(height: 14),
            FadeSlide(
              child: FxCard(
                padding: const EdgeInsets.fromLTRB(14, 16, 14, 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    CardHeader(
                      icon: Icons.assignment_outlined,
                      title: 'Estimate Details',
                      subtitle: 'Review the service estimate and approve to proceed.',
                      chip: JobChip(store.jobId),
                    ),
                    const SizedBox(height: 16),
                    FxSegmented(
                      index: _tab,
                      onChanged: (i) => setState(() => _tab = i),
                      items: const [
                        SegItem('Service', Icons.build_outlined),
                        SegItem('Live Data', Icons.show_chart_rounded),
                        SegItem('Media', Icons.smart_display_outlined),
                      ],
                    ),
                    const SizedBox(height: 14),
                    AnimatedSwitcher(
                      duration: const Duration(milliseconds: 300),
                      switchInCurve: Curves.easeOutCubic,
                      transitionBuilder: (child, anim) => FadeTransition(
                        opacity: anim,
                        child: SlideTransition(
                          position: Tween<Offset>(
                            begin: const Offset(0, 0.03),
                            end: Offset.zero,
                          ).animate(anim),
                          child: child,
                        ),
                      ),
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
            ),
          ],
        );
      },
    );
  }
}

// ---------------------------------------------------------------- Bay header

/// Reference "tracking" look: a photo of the service bay on top with a
/// white panel below it holding the vehicle, the dotted progress track and
/// the current step. Display only – all actions stay in the tabs below.
class _BayHeader extends StatelessWidget {
  final JobStore store;
  const _BayHeader({required this.store});

  @override
  Widget build(BuildContext context) {
    final v = store.vehicle;
    final done = store.status == JobStatus.completed || store.status == JobStatus.paid;
    return Container(
      decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(28)),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            height: 170,
            child: Stack(
              fit: StackFit.expand,
              children: [
                Image.asset(
                  'assets/images/workshop_1.jpg',
                  fit: BoxFit.cover,
                  alignment: const Alignment(0, -0.15),
                  excludeFromSemantics: true,
                  errorBuilder: (context, error, stackTrace) => Image.asset(
                    'assets/images/garage_fixora.jpg',
                    fit: BoxFit.cover,
                    excludeFromSemantics: true,
                    errorBuilder: (context, error, stackTrace) => ColoredBox(color: AppColors.sky),
                  ),
                ),
                Positioned(
                  left: 12,
                  top: 12,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                    decoration: BoxDecoration(
                      color: AppColors.chrome,
                      borderRadius: BorderRadius.circular(999),
                      boxShadow: AppShadows.float,
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 8,
                          height: 8,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: done ? AppColors.success : AppColors.danger,
                          ),
                        ),
                        const SizedBox(width: 6),
                        Text(
                          done ? 'Ready' : 'Live · Bay 2',
                          style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: AppColors.navy),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    VehicleIcon(v),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(v.name,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.navy)),
                          Text('${v.plate} · Job ${store.jobId}',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(fontSize: 12.5, color: AppColors.textMuted)),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                DotsProgress(current: jobStep(store.status)),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        store.currentStepLabel,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: AppColors.text),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      store.statusLabel,
                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.link),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------- Service tab

class _ServiceTab extends StatelessWidget {
  const _ServiceTab();

  @override
  Widget build(BuildContext context) {
    final store = JobStore.instance;
    final status = store.status;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Diagnosis shortcut
        _LinkTile(
          icon: Icons.troubleshoot_rounded,
          color: AppColors.danger,
          title: 'Diagnosis Report',
          subtitle: '${MockData.primaryFinding.code} · ${MockData.primaryFinding.title} + 2 findings',
          onTap: () => context.push(const DiagnosisReportScreen()),
        ),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.fromLTRB(12, 14, 12, 12),
          decoration: BoxDecoration(
            color: AppColors.surfaceSolid,
            borderRadius: BorderRadius.circular(16),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text.rich(
                TextSpan(children: [
                  TextSpan(
                      text: 'Service: ',
                      style: TextStyle(color: AppColors.link, fontWeight: FontWeight.w700)),
                  TextSpan(
                      text: 'Diagnosis & Repair',
                      style: TextStyle(color: AppColors.navy, fontWeight: FontWeight.w700)),
                ]),
                style: const TextStyle(fontSize: 16),
              ),
              const SizedBox(height: 10),
              _CostLine(
                state: StepState2.done,
                title: 'Parts',
                subtitle: 'Replacement parts & consumables',
                amount: store.partsTotal,
              ),
              _CostLine(
                state: StepState2.done,
                title: 'Labour',
                subtitle: 'Mechanic service charges',
                amount: store.labourTotal,
              ),
              _CostLine(
                state: StepState2.current,
                title: 'Tax (VAT ${(MockData.vatRate * 100).round()}%)',
                subtitle: 'Government VAT @ ${(MockData.vatRate * 100).round()}%',
                amount: store.tax,
                last: true,
              ),
              const SizedBox(height: 6),
              Row(
                children: [
                  const SizedBox(
                    width: 30,
                    child: Center(child: StepDot(state: StepState2.pending, size: 22)),
                  ),
                  const SizedBox(width: 8),
                  Expanded(child: TotalBar(value: lkr(store.total))),
                ],
              ),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton.icon(
                  onPressed: () => context.push(const EstimatePriceScreen()),
                  icon: const Icon(Icons.receipt_long_outlined, size: 18),
                  label: const Text('See item breakdown'),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: AppColors.successSoft,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.success.o(0.2)),
          ),
          child: Row(
            children: [
              const Icon(Icons.inventory_2_outlined, color: AppColors.success, size: 30),
              Container(
                width: 1.4,
                height: 36,
                margin: const EdgeInsets.symmetric(horizontal: 14),
                color: AppColors.success.o(0.3),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Parts Availability', style: AppText.h3),
                    const SizedBox(height: 3),
                    Row(
                      children: [
                        const Icon(Icons.check_circle_outline_rounded,
                            size: 16, color: AppColors.success),
                        const SizedBox(width: 5),
                        Expanded(
                          child: Text(
                            store.allPartsInStock
                                ? 'All parts are available in stock.'
                                : 'Some parts need to be ordered.',
                            style: AppText.muted.copyWith(color: AppColors.text),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        if (status == JobStatus.awaitingApproval) ...[
          Row(
            children: [
              Expanded(
                child: PrimaryButton(
                  label: 'Approve',
                  icon: Icons.check_rounded,
                  onPressed: () => context.push(const ApprovalRequestScreen()),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: OutlineButton2(
                  label: 'Reject',
                  icon: Icons.close_rounded,
                  color: AppColors.danger,
                  onPressed: () => _confirmReject(context),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Center(
            child: LinkButton(
              label: 'Request Changes',
              icon: Icons.edit_note_rounded,
              onTap: () => context.push(const RequestChangesScreen()),
            ),
          ),
        ] else if (status == JobStatus.changesRequested) ...[
          _Banner(
            color: AppColors.warning,
            icon: Icons.history_rounded,
            title: store.changeRequests.isEmpty
                ? 'Estimate rejected'
                : 'Change request ${store.changeRequests.first.id}',
            message: 'Under review by ${MockData.advisorName}. You will be notified when the revised estimate is ready.',
          ),
          const SizedBox(height: 12),
          PrimaryButton(
            label: 'Approve Current Estimate',
            icon: Icons.check_rounded,
            onPressed: () => context.push(const ApprovalRequestScreen()),
          ),
        ] else ...[
          _Banner(
            color: AppColors.success,
            icon: Icons.verified_rounded,
            title: 'Estimate approved',
            message: store.approvalRemarks?.isNotEmpty == true
                ? 'Your note: "${store.approvalRemarks}"'
                : 'Approved digitally. Work started on this job.',
          ),
          const SizedBox(height: 12),
          if (status == JobStatus.inProgress)
            PrimaryButton(
              label: 'Track Repair Progress',
              icon: Icons.timeline_rounded,
              onPressed: () => context.push(const RepairProgressScreen()),
            )
          else ...[
            PrimaryButton(
              label: 'View Service Summary',
              icon: Icons.celebration_outlined,
              onPressed: () => context.push(const ServiceCompletedScreen()),
            ),
            const SizedBox(height: 10),
            OutlineButton2(
              label: 'View Invoice',
              icon: Icons.description_outlined,
              onPressed: () => context.push(const InvoiceScreen()),
            ),
          ],
        ],
      ],
    );
  }

  void _confirmReject(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        margin: const EdgeInsets.all(12),
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 16),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(26),
        ),
        child: SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const IconTile(icon: Icons.report_gmailerrorred_rounded, color: AppColors.danger, size: 60),
              const SizedBox(height: 12),
              Text('Reject this estimate?', style: AppText.h1),
              const SizedBox(height: 6),
              Text(
                'No work will start. You can request changes instead, e.g. use a cheaper part or remove an item.',
                textAlign: TextAlign.center,
                style: AppText.muted.copyWith(fontSize: 13.5),
              ),
              const SizedBox(height: 18),
              Row(
                children: [
                  Expanded(
                    child: OutlineButton2(
                      label: 'Request Changes',
                      fontSize: 14,
                      onPressed: () {
                        Navigator.of(ctx).pop();
                        context.push(const RequestChangesScreen());
                      },
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: PrimaryButton(
                      label: 'Reject',
                      fontSize: 14,
                      gradient: AppColors.sosGradient,
                      onPressed: () {
                        Navigator.of(ctx).pop();
                        JobStore.instance.reject();
                        showFxSnack(context, 'Estimate rejected. The advisor will contact you.',
                            icon: Icons.info_outline_rounded);
                      },
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CostLine extends StatelessWidget {
  final StepState2 state;
  final String title;
  final String subtitle;
  final double amount;
  final bool last;
  const _CostLine({
    required this.state,
    required this.title,
    required this.subtitle,
    required this.amount,
    this.last = false,
  });

  @override
  Widget build(BuildContext context) {
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            width: 30,
            child: Column(
              children: [
                const SizedBox(height: 4),
                StepDot(state: state, size: 24),
                Expanded(
                  child: Container(width: 2, color: AppColors.adapt(Color(0xFFD6E7E5))),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 8),
              decoration: BoxDecoration(
                border: Border(bottom: BorderSide(color: AppColors.divider)),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(title, style: AppText.h3.copyWith(fontSize: 15)),
                        Text(subtitle, style: AppText.small),
                      ],
                    ),
                  ),
                  Text(lkr(amount), style: AppText.money.copyWith(fontSize: 15.5)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _LinkTile extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  const _LinkTile({
    required this.icon,
    required this.color,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            color: AppColors.surfaceSolid,
          ),
          child: Row(
            children: [
              IconTile(icon: icon, color: color, size: 42),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: AppText.h3.copyWith(fontSize: 14.5)),
                    const SizedBox(height: 2),
                    Text(subtitle,
                        maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.small),
                  ],
                ),
              ),
              Icon(Icons.chevron_right_rounded, color: AppColors.textMuted),
            ],
          ),
        ),
      ),
    );
  }
}

class _Banner extends StatelessWidget {
  final Color color;
  final IconData icon;
  final String title;
  final String message;
  const _Banner({
    required this.color,
    required this.icon,
    required this.title,
    required this.message,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: color.o(0.08),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.o(0.25)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color, size: 26),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: AppText.h3.copyWith(color: color)),
                const SizedBox(height: 3),
                Text(message, style: AppText.muted.copyWith(color: AppColors.text)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------- Live tab

class _LiveTab extends StatelessWidget {
  const _LiveTab();

  @override
  Widget build(BuildContext context) {
    final store = JobStore.instance;
    final current = store.status == JobStatus.inProgress
        ? store.progress
        : (store.status == JobStatus.completed || store.status == JobStatus.paid)
            ? MockData.progressSteps.length
            : 0;
    final photos = store.media.where((m) => m.kind == MediaKind.photo).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _TabHeader(title: 'Live Data', updated: dayTime(DateTime(2026, 8, 27, 14, 10))),
        const SizedBox(height: 10),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Expanded(flex: 13, child: LiveFeed(height: 156)),
            const SizedBox(width: 8),
            Expanded(
              flex: 10,
              child: Column(
                children: [
                  InfoTile(
                      icon: Icons.directions_car_outlined,
                      label: 'Vehicle',
                      value: store.vehicle.name),
                  const SizedBox(height: 6),
                  InfoTile(
                      icon: Icons.badge_outlined, label: 'Plate No.', value: store.vehicle.plate),
                  const SizedBox(height: 6),
                  InfoTile(
                    icon: Icons.build_outlined,
                    label: 'Current Step',
                    value: store.currentStepLabel,
                    highlight: true,
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        Text('Live Progress', style: AppText.h3),
        const SizedBox(height: 12),
        HorizontalProgress(
          titles: MockData.progressSteps,
          current: current,
          subtitles: List.generate(MockData.progressSteps.length, (i) {
            if (i < current) return dayTime(MockData.progressTimes[i]).replaceFirst(', ', ',\n');
            if (i == current) return 'In Progress';
            return null;
          }),
        ),
        const SizedBox(height: 16),
        Text('Live Readings (OBD-II)', style: AppText.h3),
        const SizedBox(height: 10),
        GridView.count(
          crossAxisCount: 4,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 8,
          crossAxisSpacing: 8,
          childAspectRatio: 0.92,
          children: [
            for (final r in MockData.liveReadings)
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: r.warning ? AppColors.warningSoft : AppColors.primarySofter,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                      color: r.warning ? AppColors.warning.o(0.35) : AppColors.border),
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    FittedBox(
                      child: Text.rich(TextSpan(children: [
                        TextSpan(
                            text: r.value,
                            style: TextStyle(
                                fontSize: 17,
                                fontWeight: FontWeight.w800,
                                color: r.warning ? AppColors.warningText : AppColors.navy)),
                        TextSpan(
                            text: ' ${r.unit}',
                            style: TextStyle(fontSize: 10, color: AppColors.textMuted)),
                      ])),
                    ),
                    const SizedBox(height: 3),
                    Text(r.label,
                        textAlign: TextAlign.center,
                        maxLines: 2,
                        style: AppText.small.copyWith(fontSize: 9.5)),
                  ],
                ),
              ),
          ],
        ),
        const SizedBox(height: 14),
        MechanicUpdateCard(
          name: MockData.mechanicName,
          message: 'Installing new thermostat and front brake pads. Wheel alignment next. Expected to finish soon.',
          time: 'Today, 02:10 PM',
          photos: photos.where((m) => m.bytes == null).skip(1).map((m) => m.asset).toList(),
          totalPhotos: photos.length,
          onViewAll: () => context.push(const ViewPhotosScreen()),
        ),
      ],
    );
  }
}

class _TabHeader extends StatelessWidget {
  final String title;
  final String updated;
  const _TabHeader({required this.title, required this.updated});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(title, style: AppText.h2),
        const SizedBox(width: 8),
        const LivePill(),
        const Spacer(),
        Flexible(
          flex: 3,
          child: Text('Last Updated: $updated',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.right,
              style: AppText.small.copyWith(fontSize: 10.5, color: AppColors.navy)),
        ),
        const SizedBox(width: 4),
        GestureDetector(
          onTap: () => showFxSnack(context, 'Live data refreshed', icon: Icons.refresh_rounded),
          child: Icon(Icons.refresh_rounded, size: 20, color: AppColors.link),
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
    final before = store.media.firstWhere((m) => m.stage == MediaStage.before,
        orElse: () => MockData.initialMedia.first);
    final after = store.media.firstWhere((m) => m.stage == MediaStage.after,
        orElse: () => MockData.initialMedia[4]);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _TabHeader(title: 'Media', updated: dayTime(DateTime(2026, 8, 27, 14, 10))),
        const SizedBox(height: 10),
        VehicleStrip(
          vehicle: store.vehicle,
          compact: true,
          trailing: CurrentStepBadge(value: store.currentStepLabel),
        ),
        SectionTitle('Repair Photos (${photos.length})',
            icon: Icons.photo_outlined,
            action: 'View All',
            onAction: () => context.push(const ViewPhotosScreen())),
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
        SectionTitle('Repair Videos (${videos.length})',
            icon: Icons.smart_display_outlined,
            action: 'View All',
            onAction: () => context.push(const ViewPhotosScreen())),
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
          ],
        ),
        const SectionTitle('Before & After', icon: Icons.compare_outlined),
        Row(
          children: [
            Expanded(
              child: AspectRatio(
                aspectRatio: 1.45,
                child: MediaTile(item: before, showExpand: false,
                    onTap: () => PhotoViewerScreen.open(context, [before, after], 0)),
              ),
            ),
            Container(
              margin: const EdgeInsets.symmetric(horizontal: 6),
              width: 26,
              height: 26,
              decoration: BoxDecoration(
                color: AppColors.surfaceSolid,
                shape: BoxShape.circle,
              ),
              child: Icon(Icons.arrow_forward_rounded, size: 16, color: AppColors.link),
            ),
            Expanded(
              child: AspectRatio(
                aspectRatio: 1.45,
                child: MediaTile(item: after, showExpand: false,
                    onTap: () => PhotoViewerScreen.open(context, [before, after], 1)),
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        PrimaryButton(
          label: 'Add Media',
          icon: Icons.add_rounded,
          height: 50,
          onPressed: () => context.push(const AddMediaScreen()),
        ),
      ],
    );
  }
}
