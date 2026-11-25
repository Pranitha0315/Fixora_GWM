import 'package:flutter/material.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../app/theme/bronze_buttons.dart';
import '../../data/drivesense_repository.dart';
import '../../domain/drivesense_models.dart';

class DriveSenseDetailsScreen extends StatefulWidget {
  const DriveSenseDetailsScreen({super.key, required this.jobId});

  final String jobId;

  @override
  State<DriveSenseDetailsScreen> createState() =>
      _DriveSenseDetailsScreenState();
}

class _DriveSenseDetailsScreenState extends State<DriveSenseDetailsScreen> {
  final _repo = DriveSenseRepository();
  DriveSenseSnapshot? _snapshot;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final snap = await _repo.fetchSnapshot(widget.jobId);
    if (mounted) {
      setState(() {
        _snapshot = snap;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final snap = _snapshot;
    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(
        title: const Text('DriveSense'),
        backgroundColor: AppColors.surface,
        foregroundColor: AppColors.ink,
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : snap == null
              ? Center(
                  child: Text('No data', style: TextStyle(color: AppColors.body)),
                )
              : ListView(
                  padding: const EdgeInsets.all(20),
                  children: [
                    if (!snap.optedIn)
                      Text(
                        'Customer has not opted in to telematics sharing.',
                        style: TextStyle(color: AppColors.body),
                      )
                    else ...[
                      _metric('Vehicle score', '${snap.vehicleScore}/100'),
                      _metric(
                        'Rough-road exposure',
                        '${snap.roughRoadPercent.toStringAsFixed(1)}%',
                      ),
                      const SizedBox(height: 16),
                      Text(
                        'Wear flags',
                        style: TextStyle(
                          color: AppColors.ink,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 8),
                      if (snap.wearFlags.isEmpty)
                        Text('None reported', style: TextStyle(color: AppColors.body))
                      else
                        for (final f in snap.wearFlags)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 6),
                            child: Row(
                              children: [
                                Icon(Icons.flag_outlined,
                                    size: 18, color: AppColors.primary),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(f,
                                      style: TextStyle(color: AppColors.ink)),
                                ),
                              ],
                            ),
                          ),
                    ],
                    if (snap.errorMessage != null) ...[
                      const SizedBox(height: 12),
                      Text(
                        snap.errorMessage!,
                        style: TextStyle(color: AppColors.body),
                      ),
                    ],
                    const SizedBox(height: 28),
                    ElevatedButton(
                      style: BronzeButtons.elevated,
                      onPressed: () => Navigator.of(context).pop(),
                      child: const Text('Back to job'),
                    ),
                  ],
                ),
    );
  }

  Widget _metric(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Expanded(
            child: Text(label, style: TextStyle(color: AppColors.body)),
          ),
          Text(
            value,
            style: TextStyle(
              color: AppColors.ink,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}