import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:fixora_rev_mechanic/app/app.dart';

void main() {
  testWidgets('App starts on splash then can open login route', (tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: FixoraMechanicApp(),
      ),
    );

    expect(find.byIcon(Icons.build_circle_outlined), findsOneWidget);
    await tester.pump(const Duration(milliseconds: 800));
    await tester.pumpAndSettle();
    expect(find.text('Mechanic Login'), findsOneWidget);
  });
}
