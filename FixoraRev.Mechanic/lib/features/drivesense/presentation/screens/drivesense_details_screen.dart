import 'package:flutter/material.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../app/theme/app_typography.dart';
import '../../domain/drivesense_models.dart';

/// Full DriveSense details: score, rough-road, wear flags, privacy note.
class DriveSenseDetailsScreen extends StatefulWidget {
  const DriveSenseDetailsScreen({
    super.key,
    required this.jobId,
    required this.snapshot,
  });

  final String jobId;
  final DriveSenseSnapshot snapshot;

  @override
  State<DriveSenseDetailsScreen> createState() => _DriveSenseDetailsScreenState();
}

class _DriveSenseDetailsScreenState extends State<DriveSenseDetailsScreen> {
  bool _shareWithManager = false;

  @override
  Widget build(BuildContext context) {
    final s = widget.snapshot;
    return Scaffold(
      appBar: AppBar(title: const Text('DriveSense')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
        children: [
          if (s.errorMessage != null) ...[
            Text(s.errorMessage!, style: AppText.body.copyWith(color: AppColors.danger)),
            const SizedBox(height: 12),
          ] else if (!s.optedIn || !s.hasData) ...[
            Icon(Icons.sensors_off_rounded, size: 48, color: AppColors.muted),
            const SizedBox(height: 12),
            Text('No DriveSense data', style: AppText.title),
            const SizedBox(height: 6),
            Text(
              s.optedIn
                  ? 'This vehicle has no wear hints yet.'
                  : 'Customer privacy: opted out of DriveSense sharing.',
              style: AppText.body,
            ),
          ] else ...[
            Text('Vehicle score', style: AppText.label),
            Text('${s.vehicleScore} / 100', style: AppText.hero),
            const SizedBox(height: 16),
            Text('Rough-road exposure', style: AppText.label),
            Text('${s.roughRoadPercent.toStringAsFixed(1)}% of recent trips', style: AppText.title),
            const SizedBox(height: 16),
            Text('Top wear flags', style: AppText.label),
            const SizedBox(height: 8),
            for (final f in s.wearFlags)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(Icons.flag_rounded, color: AppColors.warning),
                title: Text(f, style: AppText.body),
              ),
            const Divider(height: 28),
            Text('Privacy', style: AppText.label),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Share hints with workshop manager'),
              subtitle: const Text('Off by default. Customer consent still required.'),
              value: _shareWithManager,
              activeThumbColor: AppColors.primaryStrong,
              onChanged: (v) => setState(() => _shareWithManager = v),
            ),
          ],
        ],
      ),
    );
  }
}
