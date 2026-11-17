import 'package:flutter_test/flutter_test.dart';

import 'package:fixora_rev_mechanic/app/app.dart';

void main() {
  testWidgets('Home screen loads with bronze shell branding', (tester) async {
    await tester.pumpWidget(const FixoraMechanicApp());

    expect(find.text('Welcome, Mechanic'), findsOneWidget);
    expect(find.text('Continue'), findsOneWidget);
  });
}
