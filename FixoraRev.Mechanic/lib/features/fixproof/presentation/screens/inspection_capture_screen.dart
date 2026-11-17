import 'package:flutter/material.dart';

class InspectionCaptureScreen extends StatelessWidget {
  const InspectionCaptureScreen({super.key, required this.jobId});

  final String jobId;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Inspection capture')),
      body: Center(child: Text('Capture for job ${jobId.isEmpty ? "-" : jobId}')),
    );
  }
}
