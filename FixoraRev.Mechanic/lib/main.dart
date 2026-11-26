import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app/app.dart';
import 'app/theme/theme_controller.dart';
import 'core/backend/mechanic_backend.dart';
import 'core/notifications/fcm_notification_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  // Light / Dark / System choice is read before the first frame.
  await ThemeController.instance.load();
  await FcmNotificationService.instance.initialize();
  final container = ProviderContainer();
  MechanicBackend.instance.container = container;
  runApp(UncontrolledProviderScope(container: container, child: const FixoraRevApp()));
}
