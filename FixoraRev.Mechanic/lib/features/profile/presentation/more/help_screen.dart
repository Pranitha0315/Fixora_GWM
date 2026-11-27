import 'package:flutter/material.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../core/utils/nav.dart';
import '../../../../core/widgets/rev_ui.dart';
import '../../../shell/presentation/main_shell.dart';
import 'more_widgets.dart';

/// Help & FixProof guide: the 5 FixProof steps, common questions and
/// how to reach support.
class HelpScreen extends StatelessWidget {
  const HelpScreen({super.key});

  static const _steps = <(IconData, String, String)>[
    (Icons.photo_camera_outlined, 'Take clear photos', 'Shoot each problem part in good light. Add a short video if it makes a noise.'),
    (Icons.mic_none_rounded, 'Record a voice note', 'Explain what you found in Tamil or English. Speak close to the phone.'),
    (Icons.auto_awesome_outlined, 'Check the AI draft', 'FixProof turns your photos and voice into a simple report for the customer.'),
    (Icons.fact_check_outlined, 'Verify every issue', 'Fix wrong words, set the urgency and price. Nothing goes out until you approve it.'),
    (Icons.send_outlined, 'Publish to the customer', 'The customer sees the proof and approves each repair item one by one.'),
  ];

  static const _faq = <(String, String)>[
    (
      'I forgot my PIN or Employee ID',
      'Your Employee ID is on Profile → Account. If you forgot your PIN, ask the service manager to send you a new invitation link.'
    ),
    (
      'The customer declined one item',
      'Only the approved items move to repair. The declined item stays in the job history. If the price changes, send a fresh approval.'
    ),
    (
      'What is the Evidence Passport?',
      'When a problem cannot be confirmed today, the evidence is saved to the vehicle\'s passport so the next mechanic can continue.'
    ),
    (
      'How do I accept a roadside SOS?',
      'Open the SOS alert, tap Accept, then follow Navigate. Mark Arrived when you reach the vehicle, then fix it or tow it to the queue.'
    ),
    (
      'My job is running late',
      'Open the job and tap Send progress update → Running late. The customer and the queue ETAs update automatically.'
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return MorePage(
      title: 'Help & FixProof guide',
      children: [
        RevCard(
          color: AppColors.primarySoft,
          borderColor: AppColors.primaryBorder,
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              const ToneIcon(icon: Icons.verified_outlined, tone: RevTone.orange, size: 48),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('FixProof in 5 steps',
                        style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: AppColors.ink)),
                    const SizedBox(height: 2),
                    Text('Show the customer real proof before any repair.',
                        style: TextStyle(fontSize: 14, color: AppColors.body)),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        RevCard(
          padding: const EdgeInsets.fromLTRB(14, 6, 14, 6),
          child: Column(
            children: [
              for (var i = 0; i < _steps.length; i++)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        width: 30,
                        height: 30,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(color: AppColors.primaryStrong, shape: BoxShape.circle),
                        child: Text('${i + 1}',
                            style: TextStyle(color: AppColors.onPrimary, fontWeight: FontWeight.w800)),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Icon(_steps[i].$1, size: 18, color: AppColors.primary),
                                const SizedBox(width: 6),
                                Expanded(
                                  child: Text(_steps[i].$2,
                                      style: TextStyle(
                                          fontSize: 15.5, fontWeight: FontWeight.w700, color: AppColors.ink)),
                                ),
                              ],
                            ),
                            const SizedBox(height: 2),
                            Text(_steps[i].$3,
                                style: TextStyle(fontSize: 13.5, color: AppColors.body, height: 1.4)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        RevButton(
          label: 'Open FixProof',
          icon: Icons.arrow_forward_rounded,
          onPressed: () {
            Navigator.of(context).popUntil((r) => r.isFirst);
            MainShell.switchTab(context, MainShell.fixProof);
          },
        ),
        const RevSection('Common questions'),
        RevCard(
          padding: EdgeInsets.zero,
          child: Theme(
            data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
            child: Column(
              children: [
                for (var i = 0; i < _faq.length; i++)
                  DecoratedBox(
                    decoration: BoxDecoration(
                      border: i == _faq.length - 1 ? null : Border(bottom: BorderSide(color: AppColors.border)),
                    ),
                    child: ExpansionTile(
                      title: Text(_faq[i].$1,
                          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: AppColors.ink)),
                      iconColor: AppColors.primaryStrong,
                      collapsedIconColor: AppColors.muted,
                      childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
                      expandedAlignment: Alignment.centerLeft,
                      children: [
                        Text(_faq[i].$2, style: TextStyle(fontSize: 14, color: AppColors.body, height: 1.45)),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ),
        const RevSection('Still need help?'),
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: () => context.toast('Calling workshop manager…', icon: Icons.call_outlined),
                icon: const Icon(Icons.call_outlined, size: 20),
                label: const Text('Call manager'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: () => context.toast('Support request sent. We reply within 1 working day.',
                    icon: Icons.mark_email_read_outlined),
                icon: const Icon(Icons.support_agent_rounded, size: 20),
                label: const Text('Ask support'),
              ),
            ),
          ],
        ),
      ],
    );
  }
}
