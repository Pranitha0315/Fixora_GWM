import 'package:flutter/material.dart';

import '../../../../core/backend/mechanic_backend.dart';
import '../../../../core/di/app_services.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/utils/nav.dart';
import '../../../../core/widgets/buttons.dart';
import '../../../../core/widgets/rev_common.dart';
import '../../../notifications/domain/app_notification.dart';

enum AdditionalRepairStatus {
  draft,
  awaitingManager,
  awaitingCustomer,
  approved,
  rejected,
}

extension AdditionalRepairStatusX on AdditionalRepairStatus {
  String get label => switch (this) {
        AdditionalRepairStatus.draft => 'Draft',
        AdditionalRepairStatus.awaitingManager => 'Awaiting Manager Review',
        AdditionalRepairStatus.awaitingCustomer => 'Awaiting Customer Approval',
        AdditionalRepairStatus.approved => 'Approved',
        AdditionalRepairStatus.rejected => 'Rejected',
      };

  Color get color => switch (this) {
        AdditionalRepairStatus.draft => AppColors.inkSoft,
        AdditionalRepairStatus.awaitingManager => AppColors.warning,
        AdditionalRepairStatus.awaitingCustomer => AppColors.warning,
        AdditionalRepairStatus.approved => AppColors.success,
        AdditionalRepairStatus.rejected => AppColors.danger,
      };
}

/// Additional problem found during repair → manager → customer approval.
class AdditionalRepairScreen extends StatefulWidget {
  const AdditionalRepairScreen({super.key, required this.jobId});
  final String jobId;

  @override
  State<AdditionalRepairScreen> createState() => _AdditionalRepairScreenState();
}

class _AdditionalRepairScreenState extends State<AdditionalRepairScreen> {
  final _problem = TextEditingController();
  final _repair = TextEditingController();
  final _cost = TextEditingController();
  AdditionalRepairStatus _status = AdditionalRepairStatus.draft;
  bool _hasPhoto = false;

  @override
  void dispose() {
    _problem.dispose();
    _repair.dispose();
    _cost.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_problem.text.trim().isEmpty || _repair.text.trim().isEmpty) {
      context.toast('Describe the problem and required repair',
          icon: Icons.error_outline_rounded);
      return;
    }
    setState(() => _status = AdditionalRepairStatus.awaitingManager);
    AppServices.notifications.add(AppNotification(
      title: 'Additional repair submitted',
      body: 'Awaiting manager review for job ${widget.jobId}',
      time: DateTime.now(),
      kind: NotificationKind.job,
      jobId: widget.jobId,
    ));
    context.toast('Sent for manager review', icon: Icons.check_circle_outline);

    await Future<void>.delayed(const Duration(seconds: 2));
    if (!mounted) return;
    setState(() => _status = AdditionalRepairStatus.awaitingCustomer);
    AppServices.notifications.add(AppNotification(
      title: 'Awaiting customer approval',
      body: 'Manager forwarded additional repair to customer',
      time: DateTime.now(),
      kind: NotificationKind.approval,
      jobId: widget.jobId,
    ));
  }

  void _demoCustomer(bool approve) {
    setState(() {
      _status = approve
          ? AdditionalRepairStatus.approved
          : AdditionalRepairStatus.rejected;
    });
    AppServices.notifications.add(AppNotification(
      title:
          approve ? 'Additional repair approved' : 'Additional repair rejected',
      body: approve
          ? 'Added to authorised scope of job ${widget.jobId}'
          : 'Continue originally approved repairs only',
      time: DateTime.now(),
      kind: NotificationKind.approval,
      jobId: widget.jobId,
    ));
    context.toast(
      approve
          ? 'Customer approved — you may perform this repair'
          : 'Customer rejected',
      icon: approve ? Icons.check_circle : Icons.cancel_outlined,
    );
  }

  @override
  Widget build(BuildContext context) {
    final job = AppServices.jobs.byId(widget.jobId);
    final canEdit = _status == AdditionalRepairStatus.draft;

    return Scaffold(
      appBar: AppBar(title: const Text('Additional Repair Request')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
        children: [
          AppCard(
            color: AppColors.warningSoft,
            borderColor: AppColors.warning.withValues(alpha: 0.35),
            child: Row(
              children: [
                Icon(Icons.warning_amber_rounded, color: AppColors.warning),
                SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Customer approval is required before performing additional work. Manager review alone is not enough.',
                    style: TextStyle(
                      height: 1.35,
                      fontWeight: FontWeight.w600,
                      fontSize: 13.5,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('${job.vehicle.title} · ${job.id}',
                    style: const TextStyle(fontWeight: FontWeight.w800)),
                const SizedBox(height: 6),
                Pill(
                  label: _status.label,
                  color: _status.color,
                  dense: true,
                ),
              ],
            ),
          ),
          const SectionTitle('Request details'),
          TextField(
            controller: _problem,
            enabled: canEdit,
            maxLines: 3,
            decoration: const InputDecoration(
              labelText: 'Problem description',
              alignLabelWithHint: true,
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _repair,
            enabled: canEdit,
            maxLines: 2,
            decoration: const InputDecoration(
              labelText: 'Required repair',
              alignLabelWithHint: true,
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _cost,
            enabled: canEdit,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(
              labelText: 'Estimated repair cost (optional)',
            ),
          ),
          const SizedBox(height: 12),
          AppCard(
            onTap:
                canEdit ? () => setState(() => _hasPhoto = !_hasPhoto) : null,
            child: Row(
              children: [
                Icon(
                  _hasPhoto
                      ? Icons.check_circle_rounded
                      : Icons.add_a_photo_outlined,
                  color: AppColors.primary,
                ),
                const SizedBox(width: 12),
                Text(
                  _hasPhoto ? 'Photo attached' : 'Optional photos',
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          if (canEdit)
            PrimaryButton(
              label: 'Submit request',
              icon: Icons.send_rounded,
              onPressed: _submit,
            ),
          if (_status == AdditionalRepairStatus.awaitingManager)
            AppCard(
              color: AppColors.warningSoft,
              child: Text(
                'Status: Awaiting Manager Review\nManager will either request corrections or send this to the customer.',
                style: TextStyle(height: 1.4, fontWeight: FontWeight.w600),
              ),
            ),
          if (_status == AdditionalRepairStatus.awaitingCustomer) ...[
            AppCard(
              color: AppColors.warningSoft,
              child: Text(
                'Status: Awaiting Customer Approval\nDo not start this additional repair yet. Continue originally approved work where possible.',
                style: TextStyle(height: 1.4, fontWeight: FontWeight.w600),
              ),
            ),
            if (!MechanicBackend.instance.live) ...[
            const SizedBox(height: 12),
            const Text('Demo customer decision',
                style: TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: PrimaryButton(
                    label: 'Approve',
                    onPressed: () => _demoCustomer(true),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => _demoCustomer(false),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.danger,
                      side: BorderSide(color: AppColors.danger),
                      minimumSize: const Size.fromHeight(54),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14)),
                    ),
                    child: const Text('Reject',
                        style: TextStyle(fontWeight: FontWeight.w800)),
                  ),
                ),
              ],
            ),
            ],
          ],
          if (_status == AdditionalRepairStatus.approved)
            AppCard(
              color: AppColors.successSoft,
              child: Text(
                'Approved — additional repair added to authorised scope of job ${job.id}. You can perform this work.',
                style: TextStyle(
                    color: AppColors.success,
                    fontWeight: FontWeight.w700,
                    height: 1.4),
              ),
            ),
          if (_status == AdditionalRepairStatus.rejected)
            AppCard(
              color: AppColors.dangerSoft,
              child: Text(
                'Rejected — kept on job record. Continue originally approved repairs only.',
                style: TextStyle(
                    color: AppColors.danger,
                    fontWeight: FontWeight.w700,
                    height: 1.4),
              ),
            ),
        ],
      ),
    );
  }
}
