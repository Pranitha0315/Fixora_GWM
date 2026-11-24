import 'package:flutter/material.dart';

import 'otp_args.dart';

class OtpVerificationScreen extends StatelessWidget {
  const OtpVerificationScreen({super.key, required this.args});

  final OtpArgs args;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Verify OTP')),
      body: Center(child: Text('OTP for ${args.email}')),
    );
  }
}
