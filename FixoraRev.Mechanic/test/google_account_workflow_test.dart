import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fixora_rev/features/auth/domain/auth_entities.dart';
import 'package:fixora_rev/features/auth/presentation/widgets/google_account_sheet.dart';

void main() {
  testWidgets('Add another account reaches consent and returns the account',
      (tester) async {
    GoogleAccount? selected;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => Center(
              child: ElevatedButton(
                onPressed: () async {
                  selected = await showGoogleAccountSheet(context);
                },
                child: const Text('Continue with Google'),
              ),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Continue with Google'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Use another account'));
    await tester.pumpAndSettle();

    final fields = find.byType(TextField);
    await tester.enterText(fields.at(0), 'Maya Silva');
    await tester.enterText(fields.at(1), 'maya.silva@example.com');
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    expect(find.text('Continue to Fixora Rev?'), findsOneWidget);

    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    expect(selected?.name, 'Maya Silva');
    expect(selected?.email, 'maya.silva@example.com');
  });
}
