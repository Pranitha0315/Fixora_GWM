import 'package:flutter/material.dart';

class ProgressUpdateScreen extends StatelessWidget {
  const ProgressUpdateScreen({super.key, required this.jobId});

  final String jobId;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Progress update')),
      body: Center(child: Text('Progress for job ${jobId.isEmpty ? "-" : jobId}')),
    );
  }
}
