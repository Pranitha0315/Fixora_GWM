import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:fixora_rev_mechanic/app/app.dart';

void main() {
  testWidgets('Mechanic app navigation flow works', (tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: FixoraMechanicApp(),
      ),
    );

    // Splash screen
    expect(find.byIcon(Icons.build_circle_outlined), findsOneWidget);

    await tester.pump(const Duration(milliseconds: 800));
    await tester.pumpAndSettle();

    // Login screen
    expect(find.text('Mechanic Login'), findsOneWidget);

    // Navigate to Register
    await tester.tap(find.text('Register'));
    await tester.pumpAndSettle();

    expect(find.text('Register'), findsOneWidget);

    // Return to Login
    await tester.pageBack();
    await tester.pumpAndSettle();

    expect(find.text('Mechanic Login'), findsOneWidget);

    // Navigate to Home dashboard
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();

    // Verify bottom navigation tabs
    expect(find.text('Home'), findsWidgets);
    expect(find.text('Jobs'), findsOneWidget);
    expect(find.text('Proof'), findsOneWidget);
    expect(find.text('Parts'), findsOneWidget);
    expect(find.text('Profile'), findsOneWidget);
  });
}