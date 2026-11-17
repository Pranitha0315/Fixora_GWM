import 'package:flutter/material.dart';

class RepairProposalScreen extends StatelessWidget {
  const RepairProposalScreen({super.key, required this.jobId});

  final String jobId;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Repair proposal')),
      body: Center(child: Text('Proposal for job ${jobId.isEmpty ? "-" : jobId}')),
    );
  }
}
