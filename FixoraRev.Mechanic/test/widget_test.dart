import 'package:flutter_test/flutter_test.dart';

import 'package:fixora_rev_mechanic/app/app.dart';

void main() {
  testWidgets('App shell loads', (tester) async {
    await tester.pumpWidget(const FixoraMechanicApp());
    expect(find.text('Fixora Rev Mechanic'), findsOneWidget);
  });
}
