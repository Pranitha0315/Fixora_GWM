import 'package:flutter/material.dart';

import '../../../core/core.dart';

/// Estimate table: Item | Qty | Unit Price | Amount.
class EstimateTable extends StatelessWidget {
  final List<EstimateItem> items;
  final bool showTotals;
  final bool compact;
  final String totalLabel;

  const EstimateTable({
    super.key,
    required this.items,
    this.showTotals = true,
    this.compact = false,
    this.totalLabel = 'Total Estimate',
  });

  @override
  Widget build(BuildContext context) {
    final store = JobStore.instance;
    final head = TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.textMuted);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          decoration: BoxDecoration(
            color: AppColors.primarySofter,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            children: [
              Expanded(flex: 11, child: Text('Item', style: head)),
              Expanded(flex: 2, child: Text('Qty', textAlign: TextAlign.center, style: head)),
              Expanded(flex: 5, child: Text('Unit Price', textAlign: TextAlign.right, style: head)),
              const SizedBox(width: 4),
              Expanded(flex: 5, child: Text('Amount', textAlign: TextAlign.right, style: head)),
            ],
          ),
        ),
        for (final it in items)
          Container(
            padding: EdgeInsets.symmetric(horizontal: 8, vertical: compact ? 8 : 10),
            decoration: BoxDecoration(
              border: Border(bottom: BorderSide(color: AppColors.divider)),
            ),
            child: Row(
              children: [
                Expanded(
                  flex: 11,
                  child: Row(
                    children: [
                      Container(
                        width: 32,
                        height: 32,
                        decoration: BoxDecoration(
                          color: it.color.o(0.1),
                          borderRadius: BorderRadius.circular(9),
                        ),
                        child: Icon(it.icon, size: 18, color: it.color),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(it.name,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                    fontSize: 12.5,
                                    fontWeight: FontWeight.w700,
                                    color: AppColors.navy)),
                            Text(it.subtitle,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: AppText.small.copyWith(fontSize: 10.5)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                Expanded(
                  flex: 2,
                  child: Text('${it.qty}',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 12, color: AppColors.text)),
                ),
                Expanded(
                  flex: 5,
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: Alignment.centerRight,
                    child: Text(lkr(it.unitPrice),
                        style: TextStyle(fontSize: 11, color: AppColors.textMuted)),
                  ),
                ),
                const SizedBox(width: 4),
                Expanded(
                  flex: 5,
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: Alignment.centerRight,
                    child: Text(lkr(it.amount),
                        style: TextStyle(
                            fontSize: 11.5, fontWeight: FontWeight.w700, color: AppColors.navy)),
                  ),
                ),
              ],
            ),
          ),
        if (showTotals) ...[
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
            decoration: BoxDecoration(
              color: AppColors.primarySofter,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppColors.primary.o(0.08)),
            ),
            child: Column(
              children: [
                KVRow('Parts Total', lkr(store.partsTotal)),
                KVRow('Labour Total', lkr(store.labourTotal)),
                KVRow('Tax (VAT ${(MockData.vatRate * 100).round()}%)', lkr(store.tax)),
                Padding(
                  padding: EdgeInsets.symmetric(vertical: 6),
                  child: Divider(height: 1, color: AppColors.border),
                ),
                KVRow(
                  totalLabel,
                  lkr(store.total),
                  labelStyle: TextStyle(
                      fontSize: 17, fontWeight: FontWeight.w800, color: AppColors.navy),
                  valueStyle: TextStyle(
                      fontSize: 21, fontWeight: FontWeight.w800, color: AppColors.link),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

/// Selectable radio card (Approve Estimate / Request Changes).
class RadioCard extends StatelessWidget {
  final bool selected;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final Color color;

  const RadioCard({
    super.key,
    required this.selected,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.color = AppColors.success,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 220),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: selected ? color.o(0.08) : AppColors.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: selected ? color : AppColors.border, width: selected ? 1.5 : 1),
        ),
        child: Row(
          children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 220),
              width: 22,
              height: 22,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: selected ? color : AppColors.textFaint, width: 2),
              ),
              child: Center(
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 220),
                  width: selected ? 11 : 0,
                  height: selected ? 11 : 0,
                  decoration: BoxDecoration(color: color, shape: BoxShape.circle),
                ),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: AppText.h3.copyWith(fontSize: 14.5)),
                  const SizedBox(height: 2),
                  Text(subtitle, style: AppText.muted.copyWith(fontSize: 12)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Checkbox row card (What changes do you need?).
class CheckCard extends StatelessWidget {
  final bool checked;
  final String title;
  final String subtitle;
  final ValueChanged<bool> onChanged;

  const CheckCard({
    super.key,
    required this.checked,
    required this.title,
    required this.subtitle,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => onChanged(!checked),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
        decoration: BoxDecoration(
          color: checked ? AppColors.primarySoft : AppColors.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: checked ? AppColors.primary.o(0.4) : AppColors.border),
        ),
        child: Row(
          children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              width: 22,
              height: 22,
              decoration: BoxDecoration(
                gradient: checked ? AppColors.primaryGradient : null,
                color: checked ? null : AppColors.surface,
                borderRadius: BorderRadius.circular(6),
                border: Border.all(
                    color: checked ? Colors.transparent : AppColors.textFaint, width: 1.6),
              ),
              child: checked
                  ? const Icon(Icons.check_rounded, size: 16, color: Colors.white)
                  : null,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      style: TextStyle(
                          fontSize: 13.5, fontWeight: FontWeight.w700, color: AppColors.navy)),
                  Text(subtitle, style: AppText.small.copyWith(fontSize: 11)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Generic info tile (Vehicle / Plate No. / Current Step).
class InfoTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final bool highlight;
  const InfoTile({
    super.key,
    required this.icon,
    required this.label,
    required this.value,
    this.highlight = false,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
      decoration: BoxDecoration(
        color: AppColors.surfaceSolid,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Icon(icon, size: 20, color: AppColors.link),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label,
                    style: TextStyle(
                        fontSize: 10.5, fontWeight: FontWeight.w700, color: AppColors.navy)),
                const SizedBox(height: 1),
                Text(value,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        fontSize: 11,
                        fontWeight: highlight ? FontWeight.w700 : FontWeight.w500,
                        color: highlight ? AppColors.primary : AppColors.textMuted)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Fake live camera feed with controls and a running timer.
class LiveFeed extends StatefulWidget {
  final double height;
  const LiveFeed({super.key, this.height = 150});

  @override
  State<LiveFeed> createState() => _LiveFeedState();
}

class _LiveFeedState extends State<LiveFeed> with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(seconds: 60))..repeat();
  bool _playing = true;
  bool _muted = false;

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(14),
      child: SizedBox(
        height: widget.height,
        child: Stack(
          fit: StackFit.expand,
          children: [
            Image.asset(Img.liveFrame, fit: BoxFit.cover),
            DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Colors.transparent, Colors.black.o(0.55)],
                  stops: const [0.55, 1],
                ),
              ),
            ),
            const Positioned(
              left: 8,
              top: 8,
              child: PhotoBadge('LIVE', color: AppColors.danger, icon: Icons.circle),
            ),
            Positioned(
              right: 8,
              top: 8,
              child: Icon(Icons.fullscreen_rounded, color: Colors.white.o(0.95), size: 22),
            ),
            Positioned(
              left: 8,
              right: 8,
              bottom: 6,
              child: AnimatedBuilder(
                animation: _c,
                builder: (context, _) {
                  final secs = (_c.value * 60).floor();
                  return Row(
                    children: [
                      GestureDetector(
                        onTap: () {
                          setState(() => _playing = !_playing);
                          if (_playing) {
                            _c.repeat();
                          } else {
                            _c.stop();
                          }
                        },
                        child: Icon(_playing ? Icons.pause_rounded : Icons.play_arrow_rounded,
                            color: Colors.white, size: 20),
                      ),
                      const SizedBox(width: 4),
                      Text('00:${secs.toString().padLeft(2, '0')} / Live',
                          style: const TextStyle(
                              color: Colors.white, fontSize: 10, fontWeight: FontWeight.w600)),
                      const SizedBox(width: 6),
                      Expanded(
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(2),
                          child: LinearProgressIndicator(
                            value: _c.value,
                            minHeight: 3,
                            backgroundColor: Colors.white.o(0.3),
                            valueColor: const AlwaysStoppedAnimation(AppColors.danger),
                          ),
                        ),
                      ),
                      const SizedBox(width: 6),
                      GestureDetector(
                        onTap: () => setState(() => _muted = !_muted),
                        child: Icon(_muted ? Icons.volume_off_rounded : Icons.volume_up_rounded,
                            color: Colors.white, size: 17),
                      ),
                    ],
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Success dialog used after approvals / uploads / payments.
Future<T?> showSuccessDialog<T>(
  BuildContext context, {
  required String title,
  required String message,
  Widget? extra,
  required List<Widget> Function(BuildContext dialogContext) actions,
}) {
  return showGeneralDialog<T>(
    context: context,
    barrierDismissible: true,
    barrierLabel: 'dismiss',
    barrierColor: const Color(0xFF0B1418).o(0.45),
    transitionDuration: const Duration(milliseconds: 320),
    pageBuilder: (dialogContext, _, __) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 26),
          child: Material(
            color: Colors.transparent,
            child: Container(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(26),
                boxShadow: AppShadows.card,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Align(
                    alignment: Alignment.topRight,
                    child: IconButton(
                      onPressed: () => Navigator.of(dialogContext).pop(),
                      icon: Icon(Icons.close_rounded, color: AppColors.navy),
                    ),
                  ),
                  const SuccessBurst(size: 70),
                  const SizedBox(height: 8),
                  Text(title, textAlign: TextAlign.center, style: AppText.h1),
                  const SizedBox(height: 6),
                  Text(message,
                      textAlign: TextAlign.center,
                      style: AppText.muted.copyWith(fontSize: 14)),
                  if (extra != null) ...[const SizedBox(height: 14), extra],
                  const SizedBox(height: 18),
                  Row(children: actions(dialogContext)),
                ],
              ),
            ),
          ),
        ),
      );
    },
    transitionBuilder: (_, anim, __, child) {
      final c = CurvedAnimation(parent: anim, curve: Curves.easeOutBack);
      return FadeTransition(
        opacity: anim,
        child: ScaleTransition(scale: Tween(begin: 0.9, end: 1.0).animate(c), child: child),
      );
    },
  );
}
