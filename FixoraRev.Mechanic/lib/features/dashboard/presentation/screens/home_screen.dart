import 'package:flutter/material.dart';

import '../../../../app/theme/app_colors.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(
        title: const Text('Hi, Mechanic'),
        backgroundColor: AppColors.surface,
        foregroundColor: AppColors.ink,
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(
            'Jobs for today',
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  color: AppColors.ink,
                  fontWeight: FontWeight.w700,
                ),
          ),
          const SizedBox(height: 8),
          Text(
            'Search and open jobs from the queue.',
            style: TextStyle(color: AppColors.body),
          ),
          const SizedBox(height: 20),
          TextField(
            decoration: InputDecoration(
              hintText: 'Search jobs',
              prefixIcon: Icon(Icons.search, color: AppColors.body),
              filled: true,
              fillColor: AppColors.surfaceElevated,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide(color: AppColors.outline),
              ),
            ),
          ),
          const SizedBox(height: 16),
          _JobCard(title: 'KA-01-AB-1234', subtitle: 'Brake inspection'),
          _JobCard(title: 'TN-09-XY-7788', subtitle: 'Oil service'),
        ],
      ),
    );
  }
}

class _JobCard extends StatelessWidget {
  const _JobCard({required this.title, required this.subtitle});

  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surfaceElevated,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.outline),
      ),
      child: Row(
        children: [
          Icon(Icons.directions_car, color: AppColors.primary),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: TextStyle(color: AppColors.ink, fontWeight: FontWeight.w700)),
                const SizedBox(height: 4),
                Text(subtitle, style: TextStyle(color: AppColors.body)),
              ],
            ),
          ),
          Icon(Icons.chevron_right, color: AppColors.body),
        ],
      ),
    );
  }
}
