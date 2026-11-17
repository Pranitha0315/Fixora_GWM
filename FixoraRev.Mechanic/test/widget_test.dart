import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:fixora_rev_mechanic/app/app.dart';

void main() {
  testWidgets('Home screen loads with ProviderScope', (tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: FixoraMechanicApp(),
      ),
    );

    expect(find.text('Welcome, Mechanic'), findsOneWidget);
  });
}
