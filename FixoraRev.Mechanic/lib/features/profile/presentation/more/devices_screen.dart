import 'package:flutter/material.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../core/utils/nav.dart';
import '../../../../core/widgets/rev_common.dart' show confirmDialog;
import '../../../../core/widgets/rev_ui.dart';
import '../../../diagnosis/data/mock_diagnosis_service.dart';
import 'more_widgets.dart';

enum _Link { connected, connecting, off }

class _Tool {
  _Tool(this.icon, this.name, this.detail, this.state);
  final IconData icon;
  final String name;
  final String detail;
  _Link state;
}

class _Session {
  const _Session(this.icon, this.name, this.detail, {this.current = false});
  final IconData icon;
  final String name;
  final String detail;
  final bool current;
}

/// Devices: workshop tools (OBD-II, cameras) and phones signed in to
/// this account. Tool pairing is simulated in the demo.
class DevicesScreen extends StatefulWidget {
  const DevicesScreen({super.key});

  @override
  State<DevicesScreen> createState() => _DevicesScreenState();
}

class _DevicesScreenState extends State<DevicesScreen> {
  final _tools = [
    _Tool(Icons.bluetooth_connected_rounded, MockDiagnosisService.adapterName, 'Bluetooth · simulation mode',
        _Link.connected),
    _Tool(Icons.videocam_outlined, 'Endoscope camera', 'USB-C · 5.5 mm probe', _Link.off),
    _Tool(Icons.thermostat_outlined, 'Thermal camera', 'Wi-Fi · FLIR One', _Link.off),
  ];

  final _sessions = [
    const _Session(Icons.smartphone_rounded, 'This phone', 'Colombo · active now', current: true),
    const _Session(Icons.tablet_android_rounded, 'Workshop tablet (Bay 2)', 'Colombo · last used 2 days ago'),
  ];

  Future<void> _toggle(_Tool t) async {
    if (t.state == _Link.connecting) return;
    if (t.state == _Link.connected) {
      setState(() => t.state = _Link.off);
      context.toast('${t.name} disconnected', icon: Icons.link_off_rounded);
      return;
    }
    setState(() => t.state = _Link.connecting);
    await Future<void>.delayed(const Duration(milliseconds: 1400));
    if (!mounted) return;
    setState(() => t.state = _Link.connected);
    context.toast('${t.name} connected', icon: Icons.check_circle_outline_rounded);
  }

  Future<void> _signOut(_Session s) async {
    final ok = await confirmDialog(
      context,
      title: 'Sign out ${s.name}?',
      message: 'That device will need your password (or PIN set-up again) to open Fixora Rev.',
      confirmLabel: 'Sign out',
      destructive: true,
    );
    if (!ok || !mounted) return;
    setState(() => _sessions.remove(s));
    context.toast('${s.name} signed out', icon: Icons.logout_rounded);
  }

  @override
  Widget build(BuildContext context) {
    return MorePage(
      title: 'Devices',
      subtitle: 'Connect your diagnostic tools and check where you are signed in.',
      children: [
        const RevSection('Workshop tools', top: 14),
        for (final t in _tools) _toolCard(t),
        const RevSection('Signed-in devices', top: 14),
        RevCard(
          padding: EdgeInsets.zero,
          child: Column(
            children: [
              for (var i = 0; i < _sessions.length; i++)
                Container(
                  padding: const EdgeInsets.fromLTRB(14, 10, 8, 10),
                  decoration: BoxDecoration(
                    border:
                        i == _sessions.length - 1 ? null : Border(bottom: BorderSide(color: AppColors.border)),
                  ),
                  child: Row(
                    children: [
                      ToneIcon(icon: _sessions[i].icon, tone: RevTone.grey, size: 40),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(_sessions[i].name,
                                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.ink)),
                            Text(_sessions[i].detail, style: TextStyle(fontSize: 13, color: AppColors.muted)),
                          ],
                        ),
                      ),
                      if (_sessions[i].current)
                        const RevPill(label: 'This device', tone: RevTone.green)
                      else
                        TextButton(
                          onPressed: () => _signOut(_sessions[i]),
                          style: TextButton.styleFrom(foregroundColor: AppColors.danger),
                          child: const Text('Sign out'),
                        ),
                    ],
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        Text(
          'Lost a phone? Sign it out here, then tell your workshop manager.',
          style: TextStyle(fontSize: 12.5, color: AppColors.muted),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }

  Widget _toolCard(_Tool t) {
    final (label, tone) = switch (t.state) {
      _Link.connected => ('Connected', RevTone.green),
      _Link.connecting => ('Connecting…', RevTone.amber),
      _Link.off => ('Not connected', RevTone.grey),
    };
    return RevCard(
      margin: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              ToneIcon(icon: t.icon, tone: t.state == _Link.connected ? RevTone.orange : RevTone.grey),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(t.name, style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700, color: AppColors.ink)),
                    Text(t.detail, style: TextStyle(fontSize: 13, color: AppColors.muted)),
                  ],
                ),
              ),
              RevPill(label: label, tone: tone),
            ],
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: t.state == _Link.connected
                ? OutlinedButton.icon(
                    onPressed: () => _toggle(t),
                    icon: const Icon(Icons.link_off_rounded, size: 20),
                    label: const Text('Disconnect'),
                  )
                : FilledButton.icon(
                    onPressed: t.state == _Link.connecting ? null : () => _toggle(t),
                    style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                    icon: t.state == _Link.connecting
                        ? SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2.4, color: AppColors.muted),
                          )
                        : const Icon(Icons.link_rounded, size: 20),
                    label: Text(t.state == _Link.connecting ? 'Connecting…' : 'Connect'),
                  ),
          ),
        ],
      ),
    );
  }
}
