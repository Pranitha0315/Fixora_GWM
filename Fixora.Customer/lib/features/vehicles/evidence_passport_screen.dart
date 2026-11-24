import 'package:flutter/material.dart';

import '../../core/core.dart';

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
    final all = MockData.passport[widget.vehicle.id] ?? const <PassportEntry>[];
    final open = all
        .where((e) => e.status == PassportStatus.unresolved || e.status == PassportStatus.stillUnresolved)
        .toList();
    final closed = all.where((e) => !open.contains(e)).toList();
    final list = [all, open, closed][_filter];

    return FxPage(
      title: 'Evidence Passport',
      subtitle: '${widget.vehicle.name} · ${widget.vehicle.plate}',
      children: [
        FadeSlide(
          child: FxCard(
            gradient: const LinearGradient(
              colors: [Color(0xFF7B5CFF), Color(0xFF4F3BD6)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderColor: Colors.transparent,
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
                      child: Text('Your car remembers what was suspected',
                          style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w800)),
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
        ),
        const SizedBox(height: 14),
        FxChipTabs(
          labels: ['All (${all.length})', 'Open (${open.length})', 'Closed (${closed.length})'],
          index: _filter,
          onChanged: (i) => setState(() => _filter = i),
        ),
        const SizedBox(height: 12),
        for (var i = 0; i < list.length; i++)
          FadeSlide(
            index: i,
            child: Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: _EntryCard(entry: list[i]),
            ),
          ),
        if (list.isEmpty)
          Padding(
            padding: EdgeInsets.symmetric(vertical: 40),
            child: Center(child: Text('Nothing here.', style: AppText.muted)),
          ),
        const SizedBox(height: 8),
        PrimaryButton(
          label: 'Share Passport by QR',
          icon: Icons.qr_code_2_rounded,
          gradient: const LinearGradient(colors: [Color(0xFF8B6DFF), Color(0xFF4F3BD6)]),
          onPressed: () => _share(context),
        ),
        const SizedBox(height: 8),
        Text('You decide who sees it. Links expire automatically.',
            textAlign: TextAlign.center, style: AppText.small),
      ],
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
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) => Container(
          margin: const EdgeInsets.all(12),
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(26)),
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
                  // White tile in both themes so the QR stays sharp in dark mode.
                  child: Container(
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(22),
                    ),
                    child: DemoQr(
                      data: '${widget.vehicle.plate}-$includeClosed-$includePhotos-$expiry',
                      size: 190,
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
                FxChipTabs(
                  labels: const ['1 hour', '24 hours', '7 days'],
                  index: expiry,
                  onChanged: (i) => setSheet(() => expiry = i),
                ),
                const SizedBox(height: 16),
                PrimaryButton(
                  label: 'Done',
                  icon: Icons.check_rounded,
                  onPressed: () {
                    Navigator.of(ctx).pop();
                    showFxSnack(context, 'Passport shared. You can stop sharing anytime.');
                  },
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
    return FxCard(
      padding: const EdgeInsets.all(14),
      shadow: false,
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
                    StatusPill(passportLabel(entry.status), color: color),
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
