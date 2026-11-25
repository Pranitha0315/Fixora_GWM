import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../app/theme/bronze_buttons.dart';
import '../../domain/entities/repair_item.dart';
import '../providers/proposal_provider.dart';

class RepairProposalScreen extends ConsumerStatefulWidget {
  const RepairProposalScreen({super.key, required this.jobId});

  final String jobId;

  @override
  ConsumerState<RepairProposalScreen> createState() =>
      _RepairProposalScreenState();
}

class _RepairProposalScreenState extends ConsumerState<RepairProposalScreen> {
  void _addItem() {
    ref.read(proposalProvider.notifier).add(
          widget.jobId,
          RepairItem(
            title: 'New line item',
            type: 'Labour',
            price: 0,
          ),
        );
  }

  Future<void> _editItem(RepairItem item) async {
    final titleCtrl = TextEditingController(text: item.title);
    final typeCtrl = TextEditingController(text: item.type);
    final priceCtrl = TextEditingController(text: item.price.toStringAsFixed(0));

  final saved = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Edit line item'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: titleCtrl,
                decoration: const InputDecoration(labelText: 'Title'),
              ),
              TextField(
                controller: typeCtrl,
                decoration: const InputDecoration(labelText: 'Type'),
              ),
              TextField(
                controller: priceCtrl,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Price (₹)'),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Save')),
        ],
      ),
    );

    if (saved == true) {
      final price = double.tryParse(priceCtrl.text.trim()) ?? item.price;
      ref.read(proposalProvider.notifier).update(
            widget.jobId,
            item.copyWith(
              title: titleCtrl.text.trim(),
              type: typeCtrl.text.trim(),
              price: price,
            ),
          );
    }
    titleCtrl.dispose();
    typeCtrl.dispose();
    priceCtrl.dispose();
  }

  void _send() {
    final state = ref.read(proposalProvider)[widget.jobId] ?? const ProposalState();
    if (state.items.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Add at least one line item')),
      );
      return;
    }
    ref.read(proposalProvider.notifier).sendForApproval(widget.jobId);
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Sent for customer approval')),
    );
    Navigator.of(context).maybePop();
  }

  @override
  Widget build(BuildContext context) {
    final proposal =
        ref.watch(proposalProvider)[widget.jobId] ?? const ProposalState();

    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(
        title: const Text('Repair proposal'),
        backgroundColor: AppColors.surface,
        foregroundColor: AppColors.ink,
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text('Job ${widget.jobId}', style: TextStyle(color: AppColors.body)),
          const SizedBox(height: 16),
          if (proposal.items.isEmpty)
            Text('No line items', style: TextStyle(color: AppColors.body))
          else
            for (final item in proposal.items)
              Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: ListTile(
                  title: Text(item.title, style: TextStyle(color: AppColors.ink)),
                  subtitle: Text(
                    '${item.type} · ₹${item.price.toStringAsFixed(0)} · ${item.decision.label}',
                    style: TextStyle(color: AppColors.body),
                  ),
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      IconButton(
                        icon: const Icon(Icons.edit_outlined),
                        onPressed: () => _editItem(item),
                      ),
                      IconButton(
                        icon: const Icon(Icons.delete_outline),
                        onPressed: () => ref
                            .read(proposalProvider.notifier)
                            .remove(widget.jobId, item.id),
                      ),
                    ],
                  ),
                ),
              ),
          OutlinedButton.icon(
            onPressed: _addItem,
            icon: const Icon(Icons.add),
            label: const Text('Add line item'),
          ),
          const SizedBox(height: 16),
          Text(
            'Total ₹${proposal.total.toStringAsFixed(0)}',
            style: TextStyle(
              color: AppColors.ink,
              fontWeight: FontWeight.w700,
              fontSize: 18,
            ),
          ),
          const SizedBox(height: 20),
          ElevatedButton(
            style: BronzeButtons.elevated,
            onPressed: _send,
            child: const Text('Send for approval'),
          ),
        ],
      ),
    );
  }
}