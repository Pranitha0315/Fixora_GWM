import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../data/models/models.dart';
import '../../data/models/vehicle.dart';
import '../../data/repositories/app_state.dart';

String passportLabel(PassportStatus s) {
  switch (s) {
    case PassportStatus.unresolved:
      return 'Unresolved';
    case PassportStatus.confirmed:
      return 'Confirmed';
    case PassportStatus.ruledOut:
      return 'Ruled Out';
    case PassportStatus.stillUnresolved:
      return 'Still Unresolved';
  }
}

Color passportColor(PassportStatus s) {
  switch (s) {
    case PassportStatus.unresolved:
      return AppColors.warning;
    case PassportStatus.confirmed:
      return AppColors.danger;
    case PassportStatus.ruledOut:
      return AppColors.success;
    case PassportStatus.stillUnresolved:
      return AppColors.purple;
  }
}

/// Evidence Passport (USP 3): suspected causes that stay with the vehicle.
class EvidencePassportScreen extends StatefulWidget {
  final Vehicle vehicle;
  const EvidencePassportScreen({super.key, required this.vehicle});

  @override
  State<EvidencePassportScreen> createState() => _EvidencePassportScreenState();
}

class _EvidencePassportScreenState extends State<EvidencePassportScreen> {
  int _filter = 0;

  @override
  Widget build(BuildContext context) {
    final all = AppState.instance.passportFor(widget.vehicle.id);
    final open = all
        .where((e) => e.status == PassportStatus.unresolved || e.status == PassportStatus.stillUnresolved)
        .toList();
    final closed = all.where((e) => !open.contains(e)).toList();
    final list = [all, open, closed][_filter];

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        title: const Text('Evidence Passport'),
        backgroundColor: AppColors.bg,
        foregroundColor: AppColors.navy,
        elevation: 0,
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
        children: [
          Text('${widget.vehicle.name} · ${widget.vehicle.plate}', style: AppText.muted),
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFF7B5CFF), Color(0xFF4F3BD6)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(22),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(
                        color: Colors.white.o(0.18),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: const Icon(Icons.shield_outlined, color: Colors.white, size: 26),
                    ),
                    const SizedBox(width: 12),
                    const Expanded(
                      child: Text(
                        'Your car remembers what was suspected',
                        style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w800),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Text(
                  'Causes that could not be confirmed stay here after the job closes. '
                  'If a related complaint comes back, the mechanic sees them first - no repeated tests.',
                  style: TextStyle(color: Colors.white.o(0.88), fontSize: 12.5, height: 1.4),
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    _count('${open.length}', 'Open'),
                    _count('${all.where((e) => e.status == PassportStatus.confirmed).length}', 'Confirmed'),
                    _count('${all.where((e) => e.status == PassportStatus.ruledOut).length}', 'Ruled out'),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          // All / Open / Closed filters
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (final e in [
                  (0, 'All (${all.length})'),
                  (1, 'Open (${open.length})'),
                  (2, 'Closed (${closed.length})'),
                ])
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(e.$2),
                      selected: _filter == e.$1,
                      onSelected: (_) => setState(() => _filter = e.$1),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          for (final entry in list)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: _EntryCard(entry: entry),
            ),
          if (list.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 40),
              child: Center(child: Text('Nothing here.', style: AppText.muted)),
            ),
          const SizedBox(height: 8),
          SizedBox(
            height: 52,
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: const LinearGradient(colors: [Color(0xFF8B6DFF), Color(0xFF4F3BD6)]),
                borderRadius: BorderRadius.circular(14),
              ),
              child: FilledButton.icon(
                // Share Passport by QR
                onPressed: () => _share(context),
                icon: const Icon(Icons.qr_code_2_rounded),
                label: const Text('Share Passport by QR'),
                style: FilledButton.styleFrom(
                  backgroundColor: Colors.transparent,
                  shadowColor: Colors.transparent,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
              ),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'You decide who sees it. Links expire automatically.',
            textAlign: TextAlign.center,
            style: AppText.small,
          ),
        ],
      ),
    );
  }

  Widget _count(String n, String label) => Expanded(
        child: Container(
          margin: const EdgeInsets.only(right: 8),
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            color: Colors.white.o(0.14),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            children: [
              Text(n, style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w800)),
              Text(label, style: TextStyle(color: Colors.white.o(0.8), fontSize: 11)),
            ],
          ),
        ),
      );

  void _share(BuildContext context) {
    var includeClosed = false;
    var includePhotos = true;
    var expiry = 1;
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) => Container(
          margin: const EdgeInsets.all(12),
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(color: AppColors.surfaceSolid, borderRadius: BorderRadius.circular(26)),
          child: SafeArea(
            top: false,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Share Evidence Passport', style: AppText.h1),
                const SizedBox(height: 4),
                Text('Show this QR to any garage. They see only what you allow.', style: AppText.muted),
                const SizedBox(height: 16),
                Center(
                  child: Container(
                    width: 190,
                    height: 190,
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(22),
                      border: Border.all(color: AppColors.border),
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.qr_code_2_rounded, size: 96, color: AppColors.navy),
                        const SizedBox(height: 8),
                        Text(
                          '${widget.vehicle.plate}-$includeClosed-$includePhotos-$expiry',
                          textAlign: TextAlign.center,
                          style: AppText.small.copyWith(fontSize: 10),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                SwitchListTile.adaptive(
                  contentPadding: EdgeInsets.zero,
                  value: includeClosed,
                  onChanged: (v) => setSheet(() => includeClosed = v),
                  title: Text('Include closed items', style: AppText.label),
                  subtitle: Text('Confirmed and ruled-out causes', style: AppText.small),
                ),
                SwitchListTile.adaptive(
                  contentPadding: EdgeInsets.zero,
                  value: includePhotos,
                  onChanged: (v) => setSheet(() => includePhotos = v),
                  title: Text('Include photos & OBD evidence', style: AppText.label),
                  subtitle: Text('Thermal, camera and scan files', style: AppText.small),
                ),
                const SizedBox(height: 6),
                Text('Link expires in', style: AppText.label),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  children: [
                    for (final e in const [(0, '1 hour'), (1, '24 hours'), (2, '7 days')])
                      ChoiceChip(
                        label: Text(e.$2),
                        selected: expiry == e.$1,
                        onSelected: (_) => setSheet(() => expiry = e.$1),
                      ),
                  ],
                ),
                const SizedBox(height: 16),
                SizedBox(
                  height: 50,
                  child: FilledButton.icon(
                    onPressed: () {
                      Navigator.of(ctx).pop();
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('Passport shared. You can stop sharing anytime.'),
                          behavior: SnackBarBehavior.floating,
                        ),
                      );
                    },
                    icon: const Icon(Icons.check_rounded),
                    label: const Text('Done'),
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _EntryCard extends StatelessWidget {
  final PassportEntry entry;
  const _EntryCard({required this.entry});

  @override
  Widget build(BuildContext context) {
    final color = passportColor(entry.status);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surfaceSolid,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 4,
            height: 64,
            decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(4)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(child: Text(entry.title, style: AppText.h3.copyWith(fontSize: 14.5))),
                    const SizedBox(width: 8),
                    // Confirmed · Ruled Out · Unresolved statuses
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: color.o(0.12),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        passportLabel(entry.status),
                        style: TextStyle(color: color, fontWeight: FontWeight.w800, fontSize: 11.5),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(entry.detail, style: AppText.muted.copyWith(fontSize: 12.5)),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 10,
                  runSpacing: 4,
                  children: [
                    _meta(Icons.record_voice_over_outlined, entry.linkedSymptom),
                    _meta(Icons.event_outlined, entry.foundOn),
                    _meta(Icons.tag_rounded, entry.jobId),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _meta(IconData icon, String text) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: AppColors.textMuted),
          const SizedBox(width: 4),
          Text(text, style: AppText.small.copyWith(fontSize: 11)),
        ],
      );
}
