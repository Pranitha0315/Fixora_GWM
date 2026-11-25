import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app/app.dart';
import 'core/backend/mechanic_backend.dart';
import 'core/notifications/fcm_notification_service.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  final container = ProviderContainer();
  MechanicBackend.instance.container = container;
  FcmNotificationService.instance.init();
  runApp(
    UncontrolledProviderScope(
      container: container,
      child: const FixoraMechanicApp(),
    ),
  );
}
