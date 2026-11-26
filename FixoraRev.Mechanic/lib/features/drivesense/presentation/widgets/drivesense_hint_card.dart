import 'package:flutter/material.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../app/theme/app_typography.dart';
import '../../../../core/utils/nav.dart';
import '../../data/drivesense_repository.dart';
import '../../domain/drivesense_models.dart';
import '../screens/drivesense_details_screen.dart';

/// Job-details card: DriveSense wear hints only when the customer opted in.
class DriveSenseHintCard extends StatefulWidget {
  const DriveSenseHintCard({
    super.key,
    required this.jobId,
    this.customerOptedIn = true,
  });

  final String jobId;
  final bool customerOptedIn;

  @override
  State<DriveSenseHintCard> createState() => _DriveSenseHintCardState();
}

class _DriveSenseHintCardState extends State<DriveSenseHintCard> {
  final _repo = DriveSenseRepository();
  DriveSenseSnapshot? _data;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final snap = await _repo.forJob(widget.jobId, customerOptedIn: widget.customerOptedIn);
    if (!mounted) return;
    setState(() {
      _data = snap;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 12),
        child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
      );
    }
    final data = _data ?? DriveSenseSnapshot.empty;
    if (!data.optedIn) {
      return _box(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('DriveSense', style: AppText.bodyStrong),
            const SizedBox(height: 6),
            Text(
              'Customer has not opted in. Wear hints stay private.',
              style: AppText.caption,
            ),
          ],
        ),
      );
    }
    if (data.errorMessage != null) {
      return _box(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('DriveSense unavailable', style: AppText.bodyStrong),
            const SizedBox(height: 6),
            Text(data.errorMessage!, style: AppText.caption.copyWith(color: AppColors.danger)),
            TextButton(onPressed: _load, child: const Text('Retry')),
          ],
        ),
      );
    }
    if (!data.hasData) {
      return _box(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('DriveSense', style: AppText.bodyStrong),
            const SizedBox(height: 6),
            Text('No wear hints for this vehicle yet.', style: AppText.caption),
          ],
        ),
      );
    }

    final top = data.wearFlags.take(2).toList();
    return _box(
      onTap: () => context.push(DriveSenseDetailsScreen(jobId: widget.jobId, snapshot: data)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.sensors_rounded, color: AppColors.primaryStrong),
              const SizedBox(width: 8),
              Expanded(child: Text('DriveSense wear hints', style: AppText.bodyStrong)),
              Text('Score ${data.vehicleScore}', style: AppText.caption.copyWith(color: AppColors.primaryStrong)),
              const Icon(Icons.chevron_right_rounded),
            ],
          ),
          const SizedBox(height: 8),
          for (final f in top)
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Text('• $f', style: AppText.caption),
            ),
        ],
      ),
    );
  }

  Widget _box({required Widget child, VoidCallback? onTap}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Material(
        color: AppColors.surfaceAlt,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: Padding(padding: const EdgeInsets.all(14), child: child),
        ),
      ),
    );
  }
}
