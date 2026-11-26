import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../app/theme/app_typography.dart';
import '../../../../core/widgets/app_card.dart';
import '../../../../core/widgets/common.dart';
import '../../../../core/widgets/rev_common.dart' show EmptyState;
import '../../../../core/widgets/status_chip.dart';
import '../../../../core/di/app_services.dart';
import '../../domain/entities/repair_item.dart';
import '../providers/proposal_provider.dart';
import '../../../../core/backend/api_client.dart';
import '../../../../core/backend/mechanic_backend.dart';

/// Itemised repair proposal. Customer approves or declines each line.
class RepairProposalScreen extends ConsumerWidget {
  const RepairProposalScreen({super.key, required this.jobId});
  final String jobId;

  Future<void> _addItem(BuildContext context, WidgetRef ref) async {
    final titleCtrl = TextEditingController();
    final priceCtrl = TextEditingController();
    var type = RepairItemType.part;
    final formKey = GlobalKey<FormState>();

    final added = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) => Padding(
          padding: EdgeInsets.fromLTRB(20, 0, 20, MediaQuery.of(ctx).viewInsets.bottom + 20),
          child: Form(
            key: formKey,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Add repair item', style: AppText.title),
                const SizedBox(height: 16),
                Row(
                  children: [
                    for (final t in RepairItemType.values) ...[
                      ChoiceChip(
                        label: Text(t == RepairItemType.part ? 'Part' : 'Labour'),
                        selected: type == t,
                        showCheckmark: false,
                        selectedColor: AppColors.primarySoft,
                        backgroundColor: AppColors.surface,
                        labelStyle: TextStyle(
                          fontWeight: FontWeight.w700,
                          color: type == t ? AppColors.primaryStrong : AppColors.body,
                        ),
                        side: BorderSide(color: type == t ? AppColors.primaryBorder : AppColors.border),
                        onSelected: (_) => setSheet(() => type = t),
                      ),
                      const SizedBox(width: 8),
                    ],
                  ],
                ),
                const SizedBox(height: 14),
                Text('Item', style: AppText.label),
                const SizedBox(height: 6),
                TextFormField(
                  controller: titleCtrl,
                  decoration: const InputDecoration(hintText: 'e.g. Rear brake shoes'),
                  validator: (v) => (v == null || v.trim().isEmpty) ? 'Enter the item name' : null,
                ),
                const SizedBox(height: 12),
                Text('Price (LKR)', style: AppText.label),
                const SizedBox(height: 6),
                TextFormField(
                  controller: priceCtrl,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(hintText: 'e.g. 6500', prefixText: 'Rs. '),
                  validator: (v) => int.tryParse(v ?? '') == null ? 'Enter a number' : null,
                ),
                const SizedBox(height: 18),
                FilledButton(
                  onPressed: () {
                    if (formKey.currentState?.validate() ?? false) Navigator.of(ctx).pop(true);
                  },
                  child: const Text('Add item'),
                ),
              ],
            ),
          ),
        ),
      ),
    );

    if (added == true) {
      ref.read(proposalProvider.notifier).add(
            jobId,
            title: titleCtrl.text.trim(),
            price: int.parse(priceCtrl.text),
            type: type,
          );
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final job = AppServices.jobs.byId(jobId);
    final items = ref.watch(proposalProvider)[jobId] ?? const <RepairItem>[];

    final total = items.fold<int>(0, (s, i) => s + i.price);
    final approvedTotal = items
        .where((i) => i.decision == ApprovalDecision.approved)
        .fold<int>(0, (s, i) => s + i.price);
    final unsent = items.where((i) => i.decision == ApprovalDecision.notSent).length;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Repair proposal'),
        actions: [
          IconButton(
            tooltip: 'Add item',
            onPressed: () => _addItem(context, ref),
            icon: const Icon(Icons.add_circle_outline_rounded),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
        children: [
          Row(
            children: [
              PlateBadge(plate: job.vehicle.plate),
              const SizedBox(width: 10),
              Expanded(child: Text('${job.vehicle.title} · ${job.customer.name}', style: AppText.label)),
            ],
          ),
          const SizedBox(height: 12),
          InfoBanner(
            text: MechanicBackend.instance.routes[jobId]?.label ??
                (MechanicBackend.instance.live
                    ? 'Items go to the service manager first. The manager prices them and sends them to the customer, then releases what the customer approves.'
                    : 'The customer approves or declines each item separately. If a price or scope changes, the item needs a fresh approval.'),
          ),
          SectionHeader(
            title: 'Items (${items.length})',
            action: 'Add item',
            onAction: () => _addItem(context, ref),
          ),
          if (items.isEmpty)
            AppCard(
              child: EmptyState(
                compact: true,
                icon: Icons.request_quote_outlined,
                title: 'No items yet',
                message: 'Add the parts and labour you found in your FixProof report.',
                actionLabel: 'Add item',
                actionIcon: Icons.add_rounded,
                onAction: () => _addItem(context, ref),
              ),
            ),
          for (final item in items)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: AppCard(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    IconBox(
                      icon: item.type == RepairItemType.part ? Icons.settings_rounded : Icons.handyman_rounded,
                      size: 42,
                      background: AppColors.surfaceAlt,
                      foreground: AppColors.body,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(item.title, style: AppText.bodyStrong),
                          const SizedBox(height: 2),
                          Text(
                            item.linkedIssue ?? (item.type == RepairItemType.part ? 'Part' : 'Labour'),
                            style: AppText.caption,
                          ),
                          const SizedBox(height: 8),
                          StatusChip.decision(item.decision),
                        ],
                      ),
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          formatLkr(item.price),
                          style: AppText.bodyStrong.copyWith(
                            decoration: item.decision == ApprovalDecision.declined ? TextDecoration.lineThrough : null,
                            color: item.decision == ApprovalDecision.declined ? AppColors.muted : AppColors.ink,
                          ),
                        ),
                        if (item.decision == ApprovalDecision.notSent)
                          IconButton(
                            tooltip: 'Remove ${item.title}',
                            onPressed: () => ref.read(proposalProvider.notifier).remove(jobId, item.id),
                            icon: Icon(Icons.delete_outline_rounded, color: AppColors.muted),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          if (items.isNotEmpty) ...[
            const SizedBox(height: 6),
            AppCard(
              color: AppColors.surfaceAlt,
              child: Column(
                children: [
                  _TotalRow(label: 'Proposed total', value: formatLkr(total)),
                  const SizedBox(height: 8),
                  _TotalRow(label: 'Approved by customer', value: formatLkr(approvedTotal), strong: true),
                ],
              ),
            ),
          ],
        ],
      ),
      bottomNavigationBar: BottomActionBar(
        children: [
          FilledButton.icon(
            onPressed: unsent == 0
                ? null
                : () async {
                    final messenger = ScaffoldMessenger.of(context);
                    final backend = MechanicBackend.instance;
                    if (backend.live) {
                      final toSend = items.where((i) => i.decision == ApprovalDecision.notSent).toList();
                      try {
                        await backend.submitProposal(jobId, toSend);
                        ref.read(proposalProvider.notifier).markSent(jobId);
                        messenger.showSnackBar(SnackBar(
                            content: Text('${toSend.length} item${toSend.length == 1 ? '' : 's'} sent to the service manager')));
                      } on ApiException catch (e) {
                        messenger.showSnackBar(SnackBar(content: Text(e.message)));
                      }
                      return;
                    }
                    // Not signed in to the garage server: the manager would never see it.
                    await showDialog<void>(
                      context: context,
                      builder: (ctx) => AlertDialog(
                        icon: const Icon(Icons.cloud_off_rounded),
                        title: const Text('Not connected to the garage'),
                        content: const Text(
                            'You are using demo data, so this proposal cannot reach the service manager. '
                            'Sign out and sign in with your employee ID and PIN while the garage server is running.'),
                        actions: [
                          TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('OK')),
                        ],
                      ),
                    );
                  },
            icon: const Icon(Icons.send_rounded),
            label: Text(unsent == 0 ? 'All items sent' : 'Send $unsent item${unsent == 1 ? '' : 's'} for approval'),
          ),
        ],
      ),
    );
  }
}

class _TotalRow extends StatelessWidget {
  const _TotalRow({required this.label, required this.value, this.strong = false});
  final String label;
  final String value;
  final bool strong;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(child: Text(label, style: strong ? AppText.bodyStrong : AppText.body)),
        Text(
          value,
          style: strong ? AppText.title.copyWith(color: AppColors.primaryStrong) : AppText.bodyStrong,
        ),
      ],
    );
  }
}
