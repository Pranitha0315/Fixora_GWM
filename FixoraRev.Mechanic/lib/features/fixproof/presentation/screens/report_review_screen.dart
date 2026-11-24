import 'package:flutter/material.dart';

class ReportReviewScreen extends StatelessWidget {
  const ReportReviewScreen({super.key, required this.jobId});

  final String jobId;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Report review')),
      body: Center(child: Text('Review for job ${jobId.isEmpty ? "-" : jobId}')),
    );
  }
}
