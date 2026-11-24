import 'package:flutter/material.dart';

/// Pass-through frame wrapper (desktop/web preview parity with Fixora Rev).
class PhoneFrame extends StatelessWidget {
  const PhoneFrame({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) => child;
}
