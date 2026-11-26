import 'package:flutter/material.dart';

import '../../../core/di/app_services.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/utils/nav.dart';
import '../../../core/widgets/action_sheet.dart';
import '../../../core/widgets/buttons.dart';
import '../../../core/widgets/rev_common.dart';
import '../domain/part.dart';

/// Parts lookup with three-state stock and shortage prediction (USP 4).
class InventoryScreen extends StatefulWidget {
  const InventoryScreen({super.key, this.standalone = false});
  final bool standalone;

  @override
  State<InventoryScreen> createState() => _InventoryScreenState();
}

class _InventoryScreenState extends State<InventoryScreen> {
  final _search = TextEditingController();
  int _filter = 0; // 0 all, 1 low, 2 incoming, 3 shortage

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: Listenable.merge([AppServices.inventory, AppServices.jobs]),
      builder: (context, _) {
        final inv = AppServices.inventory;
        final demand = inv.upcomingDemand(AppServices.jobs.all);
        bool shortage(Part p) => (demand[p.id] ?? 0) > p.available;

        final q = _search.text.trim().toLowerCase();
        final parts = inv.parts.where((p) {
          final matches = q.isEmpty ||
              p.name.toLowerCase().contains(q) ||
              p.partNumber.toLowerCase().contains(q) ||
              p.category.toLowerCase().contains(q);
          final filterOk = switch (_filter) {
            1 => p.isLow,
            2 => p.incoming > 0,
            3 => shortage(p),
            _ => true,
          };
          return matches && filterOk;
        }).toList();

        final shortages = inv.parts.where(shortage).length;

        return Scaffold(
          appBar: AppBar(
            automaticallyImplyLeading: widget.standalone,
            title: const Text('Parts & stock'),
          ),
          body: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: [
              TextField(
                controller: _search,
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(
                  hintText: 'Search part name, number or category',
                  prefixIcon: const Icon(Icons.search_rounded),
                  suffixIcon: _search.text.isEmpty
                      ? null
                      : IconButton(
                          icon: const Icon(Icons.close_rounded),
                          onPressed: () => setState(_search.clear),
                        ),
                ),
              ),
              const SizedBox(height: 12),
              if (shortages > 0)
                AppCard(
                  margin: const EdgeInsets.only(bottom: 12),
                  color: AppColors.warningSoft,
                  borderColor: AppColors.warning.withValues(alpha: 0.35),
                  onTap: () => setState(() => _filter = 3),
                  child: Row(
                    children: [
                      Icon(Icons.trending_down_rounded,
                          color: AppColors.warning),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          '$shortages part(s) predicted short for jobs already in the queue',
                          style: TextStyle(
                              color: AppColors.ink,
                              fontWeight: FontWeight.w700),
                        ),
                      ),
                      Icon(Icons.chevron_right_rounded,
                          color: AppColors.warning),
                    ],
                  ),
                ),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    for (final (i, label) in const [
                      (0, 'All'),
                      (1, 'Low stock'),
                      (2, 'Incoming'),
                      (3, 'Predicted short')
                    ])
                      Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: ChoiceChip(
                          label: Text(label),
                          selected: _filter == i,
                          showCheckmark: false,
                          selectedColor: AppColors.primary,
                          backgroundColor: AppColors.surface,
                          side: BorderSide(
                              color: _filter == i
                                  ? AppColors.primary
                                  : AppColors.border),
                          labelStyle: TextStyle(
                            color:
                                _filter == i ? AppColors.onPrimary : AppColors.inkSoft,
                            fontWeight: FontWeight.w700,
                          ),
                          onSelected: (_) => setState(() => _filter = i),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              const _Legend(),
              const SizedBox(height: 12),
              if (parts.isEmpty)
                EmptyState(
                  icon: inv.parts.isEmpty ? Icons.inventory_2_outlined : Icons.search_off_rounded,
                  title: inv.parts.isEmpty ? 'No parts in stock yet' : 'No parts found',
                  message: inv.parts.isEmpty
                      ? 'The stock room has not added parts. Ask the manager to load the parts list.'
                      : q.isNotEmpty
                          ? 'Nothing matches "$q". Check the part number, or search by category like "brake".'
                          : 'No part is in this group right now.',
                  actionLabel: inv.parts.isEmpty ? null : 'Clear search and filter',
                  actionIcon: Icons.filter_alt_off_rounded,
                  onAction: () => setState(() {
                    _search.clear();
                    _filter = 0;
                  }),
                )
              else
                for (final p in parts)
                  _PartCard(part: p, demand: demand[p.id] ?? 0),
            ],
          ),
        );
      },
    );
  }
}

class _Legend extends StatelessWidget {
  const _Legend();

  @override
  Widget build(BuildContext context) {
    Widget item(Color c, String t) => Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
                width: 10,
                height: 10,
                decoration: BoxDecoration(
                    color: c, borderRadius: BorderRadius.circular(3))),
            const SizedBox(width: 5),
            Text(t,
                style: TextStyle(fontSize: 12, color: AppColors.inkSoft)),
            const SizedBox(width: 14),
          ],
        );
    return Row(
      children: [
        item(AppColors.success, 'Available'),
        item(AppColors.warning, 'Reserved'),
        item(AppColors.danger, 'Incoming'),
      ],
    );
  }
}

class _PartCard extends StatelessWidget {
  const _PartCard({required this.part, required this.demand});
  final Part part;
  final int demand;

  void _openSheet(BuildContext context) {
    final inv = AppServices.inventory;
    final subs = part.substituteIds.map(inv.byId).whereType<Part>().toList();
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(part.name,
                  style: const TextStyle(
                      fontSize: 19, fontWeight: FontWeight.w800)),
              Text('${part.brand} · ${part.partNumber}',
                  style: TextStyle(color: AppColors.inkSoft)),
              const SizedBox(height: 12),
              InfoRow('Unit price', Fmt.lkr(part.unitPrice)),
              InfoRow('Available', '${part.available}',
                  valueColor: AppColors.success),
              InfoRow('Reserved for jobs', '${part.reserved}',
                  valueColor: AppColors.warning),
              InfoRow(
                'Incoming',
                part.incoming == 0
                    ? '0'
                    : '${part.incoming} · ${part.incomingEta == null ? '' : Fmt.date(part.incomingEta!)}',
                valueColor: AppColors.danger,
              ),
              if (part.supplier != null) InfoRow('Supplier', part.supplier!),
              if (part.fits.isNotEmpty) InfoRow('Fits', part.fits.join(', ')),
              if (subs.isNotEmpty) ...[
                const SizedBox(height: 8),
                const Text('Compatible substitutes',
                    style: TextStyle(fontWeight: FontWeight.w800)),
                for (final s in subs)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(Icons.swap_horiz_rounded,
                        color: AppColors.success),
                    title: Text(s.name),
                    subtitle: Text(
                        '${s.available} available · ${Fmt.lkr(s.unitPrice)}'),
                  ),
              ],
              const SizedBox(height: 12),
              if (part.incoming > 0)
                PrimaryButton(
                  label: 'Mark delivery received',
                  icon: Icons.local_shipping_outlined,
                  onPressed: () {
                    inv.receiveIncoming(part);
                    AppServices.jobs.topUpReservations();
                    Navigator.pop(ctx);
                    context.toast(
                        '${part.name} received · waiting jobs updated',
                        icon: Icons.inventory_2);
                  },
                )
              else
                OutlineButtonX(
                  label: 'Request reorder (×4)',
                  icon: Icons.add_shopping_cart_rounded,
                  onPressed: () {
                    inv.reorder(part, 4);
                    Navigator.pop(ctx);
                    context.toast(
                        'Reorder requested from ${part.supplier ?? 'supplier'}',
                        icon: Icons.check);
                  },
                ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final total = part.total == 0 ? 1 : part.total;
    final predictedShort = demand > part.available;
    final inv = AppServices.inventory;
    return AppCard(
      margin: const EdgeInsets.only(bottom: 10),
      onTap: () => _openSheet(context),
      // Press and hold for the quick stock actions.
      onLongPress: () => showActionSheet(
        context,
        title: part.name,
        subtitle: '${part.available} available · ${part.reserved} reserved · ${part.incoming} incoming',
        actions: [
          SheetAction(icon: Icons.info_outline_rounded, label: 'Stock details', onTap: () => _openSheet(context)),
          if (part.incoming > 0)
            SheetAction(
              icon: Icons.local_shipping_outlined,
              label: 'Mark delivery received',
              onTap: () {
                inv.receiveIncoming(part);
                AppServices.jobs.topUpReservations();
                context.toast('${part.name} received · waiting jobs updated', icon: Icons.inventory_2);
              },
            )
          else
            SheetAction(
              icon: Icons.add_shopping_cart_rounded,
              label: 'Request reorder (×4)',
              onTap: () {
                inv.reorder(part, 4);
                context.toast('Reorder requested from ${part.supplier ?? 'supplier'}', icon: Icons.check);
              },
            ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(part.name,
                        style: const TextStyle(
                            fontWeight: FontWeight.w800, fontSize: 15)),
                    Text('${part.brand} · ${part.partNumber}',
                        style: TextStyle(
                            color: AppColors.inkSoft, fontSize: 12.5)),
                  ],
                ),
              ),
              Text(Fmt.lkr(part.unitPrice),
                  style: const TextStyle(fontWeight: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: SizedBox(
              height: 8,
              child: Row(
                children: [
                  if (part.available > 0)
                    Expanded(
                        flex: part.available,
                        child: Container(color: AppColors.success)),
                  if (part.reserved > 0)
                    Expanded(
                        flex: part.reserved,
                        child: Container(color: AppColors.warning)),
                  if (part.incoming > 0)
                    Expanded(
                        flex: part.incoming,
                        child: Container(color: AppColors.danger)),
                  if (part.total == 0)
                    Expanded(
                        flex: total, child: Container(color: AppColors.field)),
                ],
              ),
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: Text(
                    '${part.available} available · ${part.reserved} reserved · ${part.incoming} incoming',
                    style: TextStyle(
                        fontSize: 12.5, color: AppColors.inkSoft)),
              ),
              if (predictedShort)
                Pill(
                    label: 'Predicted short',
                    color: AppColors.warning,
                    dense: true)
              else if (part.isLow)
                Pill(label: 'Low', color: AppColors.danger, dense: true),
            ],
          ),
        ],
      ),
    );
  }
}
