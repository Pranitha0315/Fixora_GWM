import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../app/router/route_names.dart';
import '../../../../app/theme/app_colors.dart';
import '../../../../app/theme/app_typography.dart';
import '../../../../core/mock/mock_data.dart';
import '../../../../core/widgets/app_card.dart';
import '../../../../core/widgets/common.dart';
import '../../../../core/widgets/status_chip.dart';
import '../../../../core/di/app_services.dart';
import '../../domain/entities/inspection_issue.dart';
import '../providers/fixproof_provider.dart';
import '../widgets/inspection_issue_form.dart';

/// FixProof step 2–3: the mechanic checks every AI-drafted line,
/// edits if needed, then confirms and publishes to the customer.
/// AI never decides faults or prices on its own.
class ReportReviewScreen extends ConsumerWidget {
  const ReportReviewScreen({super.key, required this.jobId});
  final String jobId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final issues = ref.watch(reportDraftProvider);
    final tamil = ref.watch(reportTamilProvider);
    final job = AppServices.jobs.byId(jobId);

    final verified = issues.where((i) => i.verified).length;
    final allVerified = issues.isNotEmpty && verified == issues.length;
    final critical = issues.where((i) => i.severity == IssueSeverity.critical).length;
    final soon = issues.where((i) => i.severity == IssueSeverity.soon).length;

    void publish() {
      ref.read(reportStateProvider.notifier).set(jobId, ReportState.published);
      AppServices.jobs.publishFixProof(job, issues: issues.length);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Report published. ${job.customer.name} can see it now.')),
      );
      Navigator.of(context).pushReplacementNamed(RouteNames.repairProposal, arguments: jobId);
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Review AI report')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
        children: [
          InfoBanner(
            text: 'AI wrote this draft from your photos and voice. Check every issue — nothing reaches the customer until you confirm.',
            icon: Icons.auto_awesome_rounded,
            background: AppColors.warningSoft,
            foreground: AppColors.warning,
          ),
          const SizedBox(height: 14),

          // Language toggle + summary
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('${job.vehicle.title} ${job.vehicle.year}', style: AppText.heading),
                    Text('${job.vehicle.plate} · Token #${job.token}', style: AppText.caption),
                  ],
                ),
              ),
              _LangToggle(
                tamil: tamil,
                onChanged: (v) => ref.read(reportTamilProvider.notifier).state = v,
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(child: _CountBox(value: critical, label: tamil ? 'உடனே' : 'Fix now', fg: AppColors.danger, bg: AppColors.dangerSoft)),
              const SizedBox(width: 8),
              Expanded(child: _CountBox(value: soon, label: tamil ? 'விரைவில்' : 'Fix soon', fg: AppColors.warning, bg: AppColors.warningSoft)),
              const SizedBox(width: 8),
              Expanded(child: _CountBox(value: verified, label: 'Checked / ${issues.length}', fg: AppColors.primaryStrong, bg: AppColors.primarySoft)),
            ],
          ),

          const SectionHeader(title: 'Issues found'),
          if (issues.isEmpty)
            InfoBanner(
              text: 'No AI draft yet. Add issues manually below, then confirm.',
              icon: Icons.edit_note_rounded,
              background: AppColors.primarySoft,
              foreground: AppColors.primaryStrong,
            ),
          for (final issue in issues) _IssueCard(issue: issue, tamil: tamil),

          const SectionHeader(title: 'Manual entry (fallback)'),
          AppCard(
            child: InspectionIssueForm(
              onSave: ({required area, required title, required detail, required severity}) {
                ref.read(reportDraftProvider.notifier).addManual(
                      area: area,
                      title: title,
                      detail: detail,
                      severity: severity,
                    );
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Issue added')),
                );
              },
            ),
          ),

          // Transcript
          const SizedBox(height: 4),
          AppCard(
            padding: EdgeInsets.zero,
            child: Theme(
              data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
              child: ExpansionTile(
                tilePadding: const EdgeInsets.symmetric(horizontal: 16),
                childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                leading: Icon(Icons.record_voice_over_rounded, color: AppColors.muted),
                title: Text('Your voice note (transcript)', style: AppText.bodyStrong),
                children: [
                  Text(MockData.voiceTranscript, style: AppText.body),
                ],
              ),
            ),
          ),
        ],
      ),
      bottomNavigationBar: BottomActionBar(
        children: [
          if (!allVerified)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Text(
                'Tick "I checked this" on all ${issues.length} issues to publish.',
                style: AppText.caption,
                textAlign: TextAlign.center,
              ),
            ),
          // One primary action; saving the draft is the quiet second option.
          FilledButton.icon(
            onPressed: allVerified ? publish : null,
            icon: const Icon(Icons.verified_rounded),
            label: const Text('Confirm & publish'),
          ),
          TextButton(
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Draft saved')));
              Navigator.of(context).pop();
            },
            child: const Text('Save draft and close'),
          ),
        ],
      ),
    );
  }
}

class _LangToggle extends StatelessWidget {
  const _LangToggle({required this.tamil, required this.onChanged});
  final bool tamil;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    Widget seg(String text, bool value) {
      final selected = tamil == value;
      return Semantics(
        selected: selected,
        button: true,
        child: InkWell(
          borderRadius: BorderRadius.circular(999),
          onTap: () => onChanged(value),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            constraints: const BoxConstraints(minHeight: 44, minWidth: 64),
            alignment: Alignment.center,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            decoration: BoxDecoration(
              color: selected ? AppColors.surface : Colors.transparent,
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: selected ? AppColors.border : Colors.transparent),
            ),
            child: Text(
              text,
              style: TextStyle(
                fontWeight: FontWeight.w800,
                fontSize: 13,
                color: selected ? AppColors.primaryStrong : AppColors.muted,
              ),
            ),
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(color: AppColors.surfaceAlt, borderRadius: BorderRadius.circular(999)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [seg('தமிழ்', true), seg('EN', false)],
      ),
    );
  }
}

class _CountBox extends StatelessWidget {
  const _CountBox({required this.value, required this.label, required this.fg, required this.bg});
  final int value;
  final String label;
  final Color fg;
  final Color bg;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 12),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(14)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('$value', style: AppText.title.copyWith(color: fg)),
          Text(label, style: AppText.caption.copyWith(color: fg, fontWeight: FontWeight.w700), maxLines: 1, overflow: TextOverflow.ellipsis),
        ],
      ),
    );
  }
}

class _IssueCard extends ConsumerWidget {
  const _IssueCard({required this.issue, required this.tamil});
  final InspectionIssue issue;
  final bool tamil;

  Future<void> _edit(BuildContext context, WidgetRef ref) async {
    final ctrl = TextEditingController(text: tamil ? issue.detailTa : issue.detail);
    final result = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(20, 0, 20, MediaQuery.of(ctx).viewInsets.bottom + 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Edit: ${tamil ? issue.titleTa : issue.title}', style: AppText.heading),
            const SizedBox(height: 4),
            Text(tamil ? 'Editing the Tamil text' : 'Editing the English text', style: AppText.caption),
            const SizedBox(height: 14),
            TextField(controller: ctrl, maxLines: 5, minLines: 3, autofocus: true),
            const SizedBox(height: 14),
            FilledButton(
              onPressed: () => Navigator.of(ctx).pop(ctrl.text.trim()),
              child: const Text('Save changes'),
            ),
          ],
        ),
      ),
    );
    if (result != null && result.isNotEmpty) {
      ref.read(reportDraftProvider.notifier).updateDetail(issue.id, tamil: tamil, text: result);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notifier = ref.read(reportDraftProvider.notifier);
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: AppCard(
        borderColor: issue.verified ? AppColors.primaryBorder : AppColors.border,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                StatusChip.severity(issue.severity, tamil: tamil),
                const SizedBox(width: 8),
                Text(issue.area, style: AppText.caption),
                const Spacer(),
                IconButton(
                  tooltip: 'Edit issue',
                  onPressed: () => _edit(context, ref),
                  icon: Icon(Icons.edit_outlined, color: AppColors.body, size: 20),
                ),
                IconButton(
                  tooltip: 'Remove issue',
                  onPressed: () => notifier.remove(issue.id),
                  icon: Icon(Icons.delete_outline_rounded, color: AppColors.body, size: 20),
                ),
              ],
            ),
            Text(tamil ? issue.titleTa : issue.title, style: AppText.heading),
            const SizedBox(height: 6),
            Text(tamil ? issue.detailTa : issue.detail, style: AppText.body),
            const SizedBox(height: 12),
            SizedBox(
              height: 78,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: issue.evidenceLabels.length,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (_, i) => MediaTile(label: issue.evidenceLabels[i], size: 78),
              ),
            ),
            const SizedBox(height: 8),
            CheckboxListTile(
              value: issue.verified,
              onChanged: (_) => notifier.toggleVerified(issue.id),
              contentPadding: EdgeInsets.zero,
              controlAffinity: ListTileControlAffinity.leading,
              activeColor: AppColors.primaryStrong,
              dense: true,
              title: Text('I checked this on the vehicle', style: AppText.bodyStrong),
            ),
          ],
        ),
      ),
    );
  }
}
