import 'package:flutter/material.dart';

/// Root widget for Fixora Rev Mechanic.
class FixoraMechanicApp extends StatelessWidget {
  const FixoraMechanicApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Fixora Rev Mechanic',
      debugShowCheckedModeBanner: false,
      home: const Scaffold(
        body: Center(
          child: Text('Fixora Rev Mechanic'),
        ),
      ),
    );
  }
}
