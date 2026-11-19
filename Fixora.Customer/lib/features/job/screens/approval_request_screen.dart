import 'package:flutter/material.dart';

import '../../../core/backend/api_client.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../data/remote/customer_backend.dart';
import '../../../data/repositories/job_store.dart';

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
    // init: AwaitingCustomer items → _pick[id] = true
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
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Request changes coming soon'),
          behavior: SnackBarBehavior.floating,
        ),
      );
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
    await _showDone(
      title: 'Estimate Approved!',
      message: 'Thank you. Kasun Perera will start the repair now. You can follow every step live.',
    );
    if (!mounted) return;
    Navigator.of(context).pop();
  }

  /// Customer → service manager. The manager releases the approved items to the mechanic.
  Future<void> _confirmLive() async {
    if (CustomerBackend.instance.pendingProposal == null || _pick.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Nothing is waiting for your approval right now.'),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }
    setState(() => _loading = true);
    try {
      await CustomerBackend.instance.decide(_pick, note: _remarks.text.trim());
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message), behavior: SnackBarBehavior.floating),
      );
      return;
    }
    if (!mounted) return;
    setState(() => _loading = false);
    final approved = _pick.values.where((v) => v).length;
    await _showDone(
      title: 'Decision sent',
      message:
          'You approved $approved of ${_pick.length} item(s). Your service manager now releases the approved '
          'work to the mechanic. You will be notified the moment it starts.',
    );
    if (!mounted) return;
    Navigator.of(context).pop();
  }

  Future<void> _showDone({required String title, required String message}) async {
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
        title: Text(title),
        content: Text(message),
        actions: [
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(),
            style: FilledButton.styleFrom(backgroundColor: AppColors.primary),
            child: const Text('Track Repair'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final store = JobStore.instance;
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        title: const Text('Approval Request'),
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
                      child: Icon(Icons.assignment_turned_in_outlined, color: AppColors.link),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Estimate Approval', style: AppText.h2),
                          Text(
                            'Review the estimate and approve to proceed with the repair.',
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
                const SizedBox(height: 14),
                Text('Estimate Summary', style: AppText.h2),
                const SizedBox(height: 10),
                for (final it in store.items)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Row(
                      children: [
                        Icon(it.icon, color: it.color, size: 20),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(it.name, style: AppText.h3.copyWith(fontSize: 14)),
                              Text(it.subtitle, style: AppText.small),
                            ],
                          ),
                        ),
                        Text(
                          'LKR ${it.amount.toStringAsFixed(0)}',
                          style: AppText.h3.copyWith(fontSize: 13.5),
                        ),
                      ],
                    ),
                  ),
                if (_pick.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  Text('Approve item by item', style: AppText.h2),
                  const SizedBox(height: 4),
                  Text(
                    'Only the items you approve are done. Prices come from the garage, never from AI.',
                    style: AppText.small,
                  ),
                  const SizedBox(height: 6),
                  for (final it in store.items.where((i) => _pick.containsKey(i.id)))
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            '${it.name} · LKR ${it.amount.toStringAsFixed(0)}',
                            style: AppText.body,
                          ),
                        ),
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
                _radioCard(
                  selected: _approve,
                  title: 'Approve Estimate',
                  subtitle: 'Proceed with the repair as per the estimate.',
                  onTap: () => setState(() => _approve = true),
                ),
                const SizedBox(height: 8),
                _radioCard(
                  selected: !_approve,
                  title: 'Request Changes',
                  subtitle: 'Ask for changes to the estimate (e.g. parts, cost, or repair plan).',
                  onTap: () => setState(() => _approve = false),
                ),
                const SizedBox(height: 14),
                Text('Remarks (Optional)', style: AppText.label),
                const SizedBox(height: 8),
                TextField(
                  controller: _remarks,
                  maxLines: 3,
                  decoration: InputDecoration(
                    hintText: 'Add a note for the service team...',
                    filled: true,
                    fillColor: AppColors.fieldFill,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: SizedBox(
                        height: 50,
                        child: OutlinedButton(
                          onPressed: _loading ? null : () => Navigator.of(context).pop(),
                          child: const Text('Cancel'),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      flex: 2,
                      child: SizedBox(
                        height: 50,
                        child: FilledButton.icon(
                          onPressed: _loading ? null : _confirm,
                          icon: _loading
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                                )
                              : Icon(_approve ? Icons.check_rounded : Icons.edit_note_rounded),
                          label: Text(_approve ? 'Confirm Approval' : 'Continue'),
                          style: FilledButton.styleFrom(
                            backgroundColor: AppColors.primary,
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                          ),
                        ),
                      ),
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

  Widget _radioCard({
    required bool selected,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return Material(
      color: selected ? AppColors.primarySoft : AppColors.surface,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: selected ? AppColors.primary : AppColors.border,
              width: selected ? 1.6 : 1,
            ),
          ),
          child: Row(
            children: [
              Icon(
                selected ? Icons.radio_button_checked : Icons.radio_button_off,
                color: selected ? AppColors.link : AppColors.textMuted,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: AppText.h3.copyWith(fontSize: 14)),
                    Text(subtitle, style: AppText.small),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
