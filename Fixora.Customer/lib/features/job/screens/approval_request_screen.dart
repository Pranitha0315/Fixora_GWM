import 'package:flutter/material.dart';

import '../../../core/core.dart';
import '../widgets/job_widgets.dart';
import 'repair_progress_screen.dart';
import 'request_changes_screen.dart';
import '../../../core/backend/api_client.dart';
import '../../../data/remote/customer_backend.dart';

/// "Approval Request" - final confirmation of the estimate.
class ApprovalRequestScreen extends StatefulWidget {
  const ApprovalRequestScreen({super.key});

  @override
  State<ApprovalRequestScreen> createState() => _ApprovalRequestScreenState();
}

class _ApprovalRequestScreenState extends State<ApprovalRequestScreen> {
  bool _approve = true;
  bool _loading = false;
  final _remarks = TextEditingController();

  /// Live mode: approve (true) or reject (false) per backend repair item id.
  final Map<String, bool> _pick = {};

  @override
  void initState() {
    super.initState();
    for (final it in JobStore.instance.items) {
      if (it.id.isNotEmpty && it.status == 'AwaitingCustomer') _pick[it.id] = true;
    }
  }

  @override
  void dispose() {
    _remarks.dispose();
    super.dispose();
  }

  Future<void> _confirm() async {
    if (!_approve) {
      Navigator.of(context).pushReplacement(fxRoute(const RequestChangesScreen()));
      return;
    }
    if (JobStore.instance.isLive) {
      await _confirmLive();
      return;
    }
    setState(() => _loading = true);
    await Future<void>.delayed(const Duration(milliseconds: 900));
    if (!mounted) return;
    JobStore.instance.approve(remarks: _remarks.text.trim());
    setState(() => _loading = false);
    await showSuccessDialog<void>(
      context,
      title: 'Estimate Approved!',
      message: 'Thank you. ${MockData.mechanicName} will start the repair now. '
          'You can follow every step live.',
      actions: (dialogContext) => [
        Expanded(
          child: PrimaryButton(
            label: 'Track Repair',
            icon: Icons.timeline_rounded,
            height: 50,
            fontSize: 15,
            onPressed: () => Navigator.of(dialogContext).pop(),
          ),
        ),
      ],
    );
    if (!mounted) return;
    Navigator.of(context).pushReplacement(fxRoute(const RepairProgressScreen()));
  }

  /// Customer → service manager. The manager releases the approved items to the mechanic.
  Future<void> _confirmLive() async {
    if (CustomerBackend.instance.pendingProposal == null || _pick.isEmpty) {
      showFxSnack(context, 'Nothing is waiting for your approval right now.', icon: Icons.info_outline_rounded);
      return;
    }
    setState(() => _loading = true);
    try {
      await CustomerBackend.instance.decide(_pick, note: _remarks.text.trim());
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      showFxSnack(context, e.message, icon: Icons.error_outline_rounded);
      return;
    }
    if (!mounted) return;
    setState(() => _loading = false);
    final approved = _pick.values.where((v) => v).length;
    await showSuccessDialog<void>(
      context,
      title: 'Decision sent',
      message: 'You approved $approved of ${_pick.length} item(s). Your service manager now releases the approved '
          'work to the mechanic. You will be notified the moment it starts.',
      actions: (dialogContext) => [
        Expanded(
          child: PrimaryButton(
            label: 'Track Repair',
            icon: Icons.timeline_rounded,
            height: 50,
            fontSize: 15,
            onPressed: () => Navigator.of(dialogContext).pop(),
          ),
        ),
      ],
    );
    if (!mounted) return;
    Navigator.of(context).pushReplacement(fxRoute(const RepairProgressScreen()));
  }

  @override
  Widget build(BuildContext context) {
    final store = JobStore.instance;
    return FxPage(
      title: 'Approval Request',
      children: [
        FadeSlide(
          child: FxCard(
            padding: const EdgeInsets.fromLTRB(14, 16, 14, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                CardHeader(
                  icon: Icons.assignment_turned_in_outlined,
                  title: 'Estimate Approval',
                  subtitle: 'Review the estimate and approve to proceed with the repair.',
                  chip: JobChip(store.jobId),
                ),
                const SizedBox(height: 14),
                VehicleStrip(
                  vehicle: store.vehicle,
                  compact: true,
                  trailing: const StatusPill('Awaiting Approval',
                      color: AppColors.warning, icon: Icons.hourglass_top_rounded),
                ),
                const SizedBox(height: 14),
                Text('Estimate Summary', style: AppText.h2),
                const SizedBox(height: 10),
                EstimateTable(items: store.items, compact: true),
                if (_pick.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  Text('Approve item by item', style: AppText.h2),
                  const SizedBox(height: 4),
                  Text('Only the items you approve are done. Prices come from the garage, never from AI.', style: AppText.small),
                  const SizedBox(height: 6),
                  for (final it in store.items.where((i) => _pick.containsKey(i.id)))
                    Row(
                      children: [
                        Expanded(child: Text('${it.name} · ${lkr(it.amount)}', style: AppText.body)),
                        Switch(
                          value: _pick[it.id] ?? true,
                          onChanged: (v) => setState(() => _pick[it.id] = v),
                        ),
                      ],
                    ),
                ],
                const SizedBox(height: 16),
                Text('Approval Action', style: AppText.h2),
                const SizedBox(height: 10),
                RadioCard(
                  selected: _approve,
                  title: 'Approve Estimate',
                  subtitle: 'Proceed with the repair as per the estimate.',
                  onTap: () => setState(() => _approve = true),
                ),
                const SizedBox(height: 8),
                RadioCard(
                  selected: !_approve,
                  color: AppColors.primary,
                  title: 'Request Changes',
                  subtitle: 'Ask for changes to the estimate (e.g. parts, cost, or repair plan).',
                  onTap: () => setState(() => _approve = false),
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    Icon(Icons.chat_bubble_outline_rounded, size: 17, color: AppColors.navy),
                    SizedBox(width: 6),
                    Text('Remarks (Optional)', style: AppText.label),
                  ],
                ),
                const SizedBox(height: 8),
                FxTextField(
                  controller: _remarks,
                  hint: 'Add a note for the service team...',
                  maxLines: 3,
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Icon(Icons.lock_outline_rounded, size: 15, color: AppColors.textMuted),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        'Your approval is time-stamped and saved to the job card as a digital signature.',
                        style: AppText.small.copyWith(fontSize: 11),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: OutlineButton2(
                        label: 'Cancel',
                        height: 50,
                        onPressed: () => Navigator.of(context).pop(),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      flex: 2,
                      child: PrimaryButton(
                        label: _approve ? 'Confirm Approval' : 'Continue',
                        icon: _approve ? Icons.check_rounded : Icons.edit_note_rounded,
                        height: 50,
                        fontSize: 15,
                        loading: _loading,
                        onPressed: _confirm,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}