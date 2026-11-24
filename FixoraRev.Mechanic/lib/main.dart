import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app/app.dart';
import 'core/backend/mechanic_backend.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  final container = ProviderContainer();
  MechanicBackend.instance.container = container;
  runApp(
    UncontrolledProviderScope(
      container: container,
      child: const FixoraMechanicApp(),
    ),
  );
}
