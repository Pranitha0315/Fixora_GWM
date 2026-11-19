import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../data/repositories/app_state.dart';

/// Live queue & explainable ETA.
class LiveQueueScreen extends StatelessWidget {
  final String? bookingId;
  const LiveQueueScreen({super.key, this.bookingId});

  @override
  Widget build(BuildContext context) {
    final app = AppState.instance;
    return ListenableBuilder(
      listenable: app,
      builder: (context, _) {
        HomeBooking? booking;
        if (bookingId != null) {
          final found = app.bookings.where((e) => e.id == bookingId);
          if (found.isNotEmpty) booking = found.first;
        }
        booking ??= app.nextUpcoming;

        return Scaffold(
          backgroundColor: AppColors.bg,
          appBar: AppBar(
            title: const Text('Live Queue & ETA'),
            backgroundColor: AppColors.bg,
            foregroundColor: AppColors.navy,
            elevation: 0,
          ),
          body: booking == null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(
                      'No upcoming booking.\nBook a service to see your live queue position and ETA.',
                      textAlign: TextAlign.center,
                      style: AppText.muted,
                    ),
                  ),
                )
              : ListView(
                  padding: const EdgeInsets.all(20),
                  children: [
                    Container(
                      padding: const EdgeInsets.all(18),
                      decoration: BoxDecoration(
                        gradient: AppColors.primaryGradient,
                        borderRadius: BorderRadius.circular(26),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            booking.service,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 20,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            'Booking ${booking.id}',
                            style: TextStyle(color: Colors.white.withValues(alpha: 0.9)),
                          ),
                          const SizedBox(height: 16),
                          Text(
                            'Queue position · #2',
                            style: TextStyle(
                              color: Colors.white.withValues(alpha: 0.95),
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'ETA ~ ${booking.date.hour.toString().padLeft(2, '0')}:${booking.date.minute.toString().padLeft(2, '0')}',
                            style: TextStyle(color: Colors.white.withValues(alpha: 0.9)),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'Your bay and mechanic are reserved. We will update this screen as the queue moves.',
                      style: AppText.muted,
                    ),
                  ],
                ),
        );
      },
    );
  }
}
