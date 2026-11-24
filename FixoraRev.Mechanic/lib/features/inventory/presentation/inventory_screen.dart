import 'package:flutter/material.dart';

class InventoryScreen extends StatelessWidget {
  const InventoryScreen({super.key, this.standalone = false});

  final bool standalone;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(standalone ? 'Parts' : 'Parts tab')),
      body: const Center(child: Text('Parts / inventory — coming soon')),
    );
  }
}
