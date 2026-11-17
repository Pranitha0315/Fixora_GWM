import 'package:flutter/material.dart';

import 'theme/bronze_theme.dart';
import '../features/home/presentation/screens/home_screen.dart';

/// Root widget for Fixora Rev Mechanic.
class FixoraMechanicApp extends StatelessWidget {
  const FixoraMechanicApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Fixora Rev Mechanic',
      debugShowCheckedModeBanner: false,
      theme: BronzeTheme.dark,
      home: const HomeScreen(),
    );
  }
}
