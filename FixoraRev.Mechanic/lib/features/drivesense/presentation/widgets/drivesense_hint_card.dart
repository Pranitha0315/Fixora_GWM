import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/route_names.dart';
import '../../../../app/theme/app_colors.dart';
import '../../data/drivesense_repository.dart';
import '../../domain/drivesense_models.dart';

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
  DriveSenseSnapshot? _snapshot;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (!widget.customerOptedIn) {
      setState(() {
        _snapshot = const DriveSenseSnapshot(
          vehicleScore: 0,
          roughRoadPercent: 0,
          wearFlags: [],
          optedIn: false,
        );
        _loading = false;
      });
      return;
    }
    final snap = await _repo.fetchSnapshot(widget.jobId);
    if (mounted) {
      setState(() {
        _snapshot = snap;
        _loading = false;
      });
    }
  }

  void _openDetails() {
    context.push(RouteNames.driveSensePath(widget.jobId));
  }

  @override
  Widget build(BuildContext context) {
    final snap = _snapshot;
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: _loading ? null : _openDetails,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Icon(Icons.speed_outlined, color: AppColors.primary, size: 28),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'DriveSense',
                      style: TextStyle(
                        color: AppColors.ink,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 4),
                    if (_loading)
                      Text(
                        'Loading vehicle health…',
                        style: TextStyle(color: AppColors.body, fontSize: 13),
                      )
                    else if (snap != null)
                      Text(
                        snap.healthHint,
                        style: TextStyle(color: AppColors.body, fontSize: 13),
                      ),
                  ],
                ),
              ),
              if (!_loading)
                Icon(Icons.chevron_right, color: AppColors.body),
            ],
          ),
        ),
      ),
    );
  }
}