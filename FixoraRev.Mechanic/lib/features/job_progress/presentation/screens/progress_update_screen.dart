import 'dart:async';

import 'package:flutter/material.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../app/theme/bronze_buttons.dart';
import '../../../../core/backend/mechanic_backend.dart';
import '../../../../core/di/app_services.dart';

class ProgressUpdateScreen extends StatefulWidget {
  const ProgressUpdateScreen({super.key, required this.jobId});

  final String jobId;

  @override
  State<ProgressUpdateScreen> createState() => _ProgressUpdateScreenState();
}

class _ProgressUpdateScreenState extends State<ProgressUpdateScreen> {
  late double _percent;
  late final TextEditingController _message;

  @override
  void initState() {
    super.initState();
    final job = AppServices.jobs.byId(widget.jobId);
    _percent = (job?.progressPercent ?? 0).toDouble();
    _message = TextEditingController();
  }

  @override
  void dispose() {
    _message.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final job = AppServices.jobs.byId(widget.jobId);
    if (job != null) {
      AppServices.jobs.setProgress(widget.jobId, _percent.round(), _message.text.trim());
    }
    await MechanicBackend.instance.jobAction(
      widget.jobId,
      'progress',
      percent: _percent.round(),
      message: _message.text.trim().isEmpty ? null : _message.text.trim(),
    );
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Progress saved')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final job = AppServices.jobs.byId(widget.jobId);

    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(
        title: const Text('Progress update'),
        backgroundColor: AppColors.surface,
        foregroundColor: AppColors.ink,
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(
            job?.vehicleReg ?? widget.jobId,
            style: TextStyle(color: AppColors.ink, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 20),
          Text(
            '${_percent.round()}% complete',
            style: TextStyle(color: AppColors.ink, fontSize: 18),
          ),
          Slider(
            value: _percent,
            min: 0,
            max: 100,
            divisions: 20,
            activeColor: AppColors.primary,
            label: '${_percent.round()}%',
            onChanged: (v) => setState(() => _percent = v),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _message,
            minLines: 2,
            maxLines: 4,
            decoration: const InputDecoration(
              labelText: 'Update message',
              border: OutlineInputBorder(),
              hintText: 'Optional note for manager / customer',
            ),
          ),
          const SizedBox(height: 24),
          ElevatedButton(
            style: BronzeButtons.elevated,
            onPressed: _save,
            child: const Text('Save progress'),
          ),
        ],
      ),
    );
  }
}