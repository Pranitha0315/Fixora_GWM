import 'package:flutter/material.dart';

import '../../../../app/theme/app_colors.dart';

class LanguageScreen extends StatefulWidget {
  const LanguageScreen({super.key});

  @override
  State<LanguageScreen> createState() => _LanguageScreenState();
}

class _LanguageScreenState extends State<LanguageScreen> {
  String _locale = 'en';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(
        title: const Text('Language'),
        backgroundColor: AppColors.surface,
        foregroundColor: AppColors.ink,
      ),
      body: ListView(
        children: [
          RadioListTile<String>(
            title: Text('English', style: TextStyle(color: AppColors.ink)),
            value: 'en',
            groupValue: _locale,
            activeColor: AppColors.primary,
            onChanged: (v) => setState(() => _locale = v!),
          ),
          RadioListTile<String>(
            title: Text('Tamil', style: TextStyle(color: AppColors.ink)),
            value: 'ta',
            groupValue: _locale,
            activeColor: AppColors.primary,
            onChanged: (v) => setState(() => _locale = v!),
          ),
        ],
      ),
    );
  }
}