import 'package:flutter/material.dart';

class PassportScreen extends StatelessWidget {
  const PassportScreen({super.key, this.standalone = false});

  final bool standalone;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(standalone ? 'Passport' : 'Passport tab')),
      body: const Center(child: Text('Passport — coming soon')),
    );
  }
}
