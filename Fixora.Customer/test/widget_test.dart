import 'package:fixora_customer/app.dart';
import 'package:fixora_customer/core/utils/format.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('LKR formatting', () {
    expect(lkr(41400), 'LKR 41,400');
    expect(lkr(41400, decimals: true), 'LKR 41,400.00');
    expect(groupDigits(1234567), '1,234,567');
  });

  testWidgets('App opens on the Welcome screen', (tester) async {
    await tester.pumpWidget(const FixoraApp());
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('Your garage, in your pocket.'), findsOneWidget);
    expect(find.text('Log in'), findsOneWidget);
  });
}

