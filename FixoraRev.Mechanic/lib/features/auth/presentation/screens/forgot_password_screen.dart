import 'package:flutter/material.dart';

class ForgotPasswordScreen extends StatelessWidget {
  const ForgotPasswordScreen({super.key, this.initialEmail = ''});

  final String initialEmail;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Forgot password')),
      body: Center(
        child: Text(
          initialEmail.isEmpty
              ? 'Forgot password — coming soon'
              : 'Reset for $initialEmail',
        ),
      ),
    );
  }
}
