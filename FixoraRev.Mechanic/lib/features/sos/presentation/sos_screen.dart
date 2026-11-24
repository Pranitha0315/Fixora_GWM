import 'package:flutter/material.dart';

import '../../../core/widgets/placeholder_screen.dart';

class SosListScreen extends StatelessWidget {
  const SosListScreen({super.key});

  @override
  Widget build(BuildContext context) =>
      const PlaceholderScreen(title: 'SOS');
}

class SosDetailScreen extends StatelessWidget {
  const SosDetailScreen({super.key, required this.requestId});

  final String requestId;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('SOS details')),
      body: Center(
        child: Text(requestId.isEmpty ? 'SOS details' : 'SOS $requestId'),
      ),
    );
  }
}
