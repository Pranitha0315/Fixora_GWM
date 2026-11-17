import 'package:flutter/material.dart';

class EvidencePassportScreen extends StatelessWidget {
  const EvidencePassportScreen({super.key, required this.jobId});

  final String jobId;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Evidence passport')),
      body: Center(child: Text('Evidence for job ${jobId.isEmpty ? "-" : jobId}')),
    );
  }
}
