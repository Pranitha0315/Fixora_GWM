import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/backend/api_client.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../data/remote/customer_backend.dart';

enum _SosState { idle, searching, matched }

/// Roadside SOS: pick a problem, send location + category to nearby garages.
class SosScreen extends StatefulWidget {
  final bool showNav;
  const SosScreen({super.key, this.showNav = true});

  @override
  State<SosScreen> createState() => _SosScreenState();
}

class _SosScreenState extends State<SosScreen> with SingleTickerProviderStateMixin {
  static const _problems = [
    (Icons.car_crash_outlined, 'Breakdown'),
    (Icons.tire_repair_rounded, 'Flat tyre'),
    (Icons.battery_alert_rounded, 'Battery'),
    (Icons.thermostat_rounded, 'Overheating'),
    (Icons.key_off_outlined, 'Locked out'),
    (Icons.warning_amber_rounded, 'Accident'),
  ];

  late final AnimationController _pulse =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 1800))..repeat();
  int _problem = 0;
  bool _offline = false;
  _SosState _state = _SosState.idle;
  int _accepted = -1;
  int _escalateSecs = 15 * 60;
  Timer? _timer;
  String? _sosKey;
  String? _receipt;

  @override
  void initState() {
    super.initState();
    CustomerBackend.instance.sos.addListener(_onSosUpdate);
  }

  @override
  void dispose() {
    CustomerBackend.instance.sos.removeListener(_onSosUpdate);
    _pulse.dispose();
    _timer?.cancel();
    super.dispose();
  }

  void _snack(String msg, {IconData? icon}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), behavior: SnackBarBehavior.floating),
    );
  }

  /// Live hub updates. status: Acknowledged | Dispatched | OnSite | Resolved | Cancelled
  /// UI: searching → matched → Help is on the way / resolved.
  void _onSosUpdate() {
    final s = CustomerBackend.instance.sos.value;
    if (!mounted || s == null || _receipt == null || s['id'] != _receipt) return;
    final status = s['status'] as String?;
    if (status == 'Dispatched' || status == 'OnSite') {
      _timer?.cancel();
      setState(() {
        _state = _SosState.matched;
        _accepted = 0;
      });
      _snack(status == 'OnSite' ? 'Your mechanic is on site.' : 'A mechanic is on the way.');
    } else if (status == 'Acknowledged') {
      setState(() => _state = _SosState.matched);
      _snack('The garage has your SOS and is arranging help.');
    } else if (status == 'Resolved' || status == 'Cancelled') {
      _timer?.cancel();
      setState(() {
        _state = _SosState.idle;
        _accepted = -1;
        _receipt = null;
      });
      _snack(status == 'Resolved' ? 'SOS resolved. Drive safe!' : 'SOS cancelled.');
    }
  }

  Future<void> _sendLive() async {
    setState(() {
      _state = _SosState.searching;
      _accepted = -1;
      _escalateSecs = 15 * 60;
    });
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() => _escalateSecs = (_escalateSecs - 1).clamp(0, 15 * 60).toInt());
    });
    _sosKey ??= ApiClient.newIdempotencyKey();
    for (var attempt = 0; attempt < 3; attempt++) {
      try {
        final r = await CustomerBackend.instance.raiseSos(
          problem: _problems[_problem].$2,
          idempotencyKey: _sosKey,
        );
        if (!mounted) return;
        final at = DateTime.tryParse((r['receivedAt'] as String?) ?? '')?.toLocal() ?? DateTime.now();
        _sosKey = null;
        setState(() {
          _receipt = r['receiptId'] as String?;
          _state = _SosState.matched;
        });
        final receiptShort = (_receipt ?? '').length >= 8
            ? (_receipt!.substring(0, 8).toUpperCase())
            : (_receipt ?? '').toUpperCase();
        _snack('Delivered ${_time12(at)} · receipt $receiptShort');
        return;
      } on ApiException catch (e) {
        if (!e.isNetwork) {
          if (!mounted) return;
          _cancel();
          _snack(e.message);
          return;
        }
        await Future<void>.delayed(const Duration(seconds: 4));
        if (!mounted || _state == _SosState.idle) return;
      }
    }
    if (!mounted) return;
    _cancel();
    _snack('SOS not delivered. Call the garage.');
  }

  void _send() {
    if (CustomerBackend.instance.live && !_offline) {
      _sendLive();
      return;
    }
    setState(() {
      _state = _SosState.searching;
      _accepted = -1;
      _escalateSecs = 15 * 60;
    });
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() => _escalateSecs = (_escalateSecs - 1).clamp(0, 15 * 60).toInt());
    });
    if (_offline) return;
    Future<void>.delayed(const Duration(milliseconds: 2200), () {
      if (!mounted || _state != _SosState.searching) return;
      setState(() => _state = _SosState.matched);
      Future<void>.delayed(const Duration(milliseconds: 2600), () {
        if (!mounted || _state != _SosState.matched) return;
        setState(() => _accepted = 0);
        _timer?.cancel();
      });
    });
  }

  void _cancel() {
    if (_receipt != null && CustomerBackend.instance.live) {
      CustomerBackend.instance.cancelSos().catchError((Object _) {});
      _receipt = null;
    }
    _timer?.cancel();
    setState(() {
      _state = _SosState.idle;
      _accepted = -1;
    });
  }

  String get _countdown {
    final m = (_escalateSecs ~/ 60).toString().padLeft(2, '0');
    final s = (_escalateSecs % 60).toString().padLeft(2, '0');
    return '$m:$s';
  }

  String _time12(DateTime d) {
    final h = d.hour % 12 == 0 ? 12 : d.hour % 12;
    final m = d.minute.toString().padLeft(2, '0');
    final ap = d.hour >= 12 ? 'PM' : 'AM';
    return '$h:$m $ap';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        title: const Text('Roadside SOS'),
        backgroundColor: AppColors.bg,
        foregroundColor: AppColors.navy,
        elevation: 0,
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: GestureDetector(
              onTap: () => setState(() => _offline = !_offline),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 220),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: _offline ? AppColors.ink : AppColors.surface,
                  borderRadius: BorderRadius.circular(30),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      _offline ? Icons.wifi_off_rounded : Icons.wifi_rounded,
                      size: 16,
                      color: _offline ? Colors.white : AppColors.success,
                    ),
                    const SizedBox(width: 6),
                    Text(
                      _offline ? 'Offline (demo)' : 'Online',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: _offline ? Colors.white : AppColors.navy,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
        children: [
          Text('Stuck? We find a garage that can actually fix it.', style: AppText.muted),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.dangerSoft,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.danger.o(0.25)),
            ),
            child: Row(
              children: [
                const Icon(Icons.local_hospital_outlined, color: AppColors.danger),
                const SizedBox(width: 10),
                Expanded(
                  child: Text.rich(
                    const TextSpan(children: [
                      TextSpan(text: 'Anyone hurt? Call '),
                      TextSpan(text: '1990', style: TextStyle(fontWeight: FontWeight.w800)),
                      TextSpan(text: ' (Suwa Seriya) or '),
                      TextSpan(text: '119', style: TextStyle(fontWeight: FontWeight.w800)),
                      TextSpan(text: ' (Police) first.'),
                    ]),
                    style: AppText.body.copyWith(fontSize: 12.5),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 350),
            child: _state == _SosState.idle ? _idle() : _active(),
          ),
        ],
      ),
    );
  }

  Widget _idle() {
    return Column(
      key: const ValueKey('idle'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('What happened?', style: AppText.h3),
        const SizedBox(height: 10),
        GridView.count(
          crossAxisCount: 3,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 8,
          crossAxisSpacing: 8,
          childAspectRatio: 1.35,
          children: [
            for (var i = 0; i < _problems.length; i++)
              GestureDetector(
                onTap: () => setState(() => _problem = i),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  decoration: BoxDecoration(
                    color: i == _problem ? AppColors.dangerSoft : AppColors.surface,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                      color: i == _problem ? AppColors.danger : AppColors.border,
                      width: i == _problem ? 1.5 : 1,
                    ),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        _problems[i].$1,
                        color: i == _problem ? AppColors.danger : AppColors.navy,
                        size: 26,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _problems[i].$2,
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: i == _problem ? AppColors.dangerText : AppColors.navy,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 14),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppColors.surfaceSolid,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(
            children: [
              Icon(Icons.my_location_rounded, color: AppColors.link, size: 28),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Peradeniya Rd, Kandy', style: AppText.h3),
                    Text('GPS ±12 m · used for SOS dispatch', style: AppText.small),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 22),
        Center(
          child: GestureDetector(
            onTap: _send,
            child: SizedBox(
              width: 220,
              height: 220,
              child: AnimatedBuilder(
                animation: _pulse,
                builder: (_, child) {
                  return Stack(
                    alignment: Alignment.center,
                    children: [
                      for (var k = 0; k < 3; k++)
                        Builder(builder: (_) {
                          final t = (_pulse.value + k / 3) % 1;
                          return Transform.scale(
                            scale: 0.6 + t * 0.45,
                            child: Container(
                              width: 220,
                              height: 220,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: AppColors.danger.o(0.18 * (1 - t)),
                              ),
                            ),
                          );
                        }),
                      child!,
                    ],
                  );
                },
                child: Container(
                  width: 140,
                  height: 140,
                  decoration: BoxDecoration(
                    gradient: AppColors.sosGradient,
                    shape: BoxShape.circle,
                    border: Border.all(color: AppColors.surface, width: 6),
                    boxShadow: [
                      BoxShadow(color: AppColors.danger.o(0.45), blurRadius: 30, offset: const Offset(0, 12)),
                    ],
                  ),
                  child: const Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text('SOS', style: TextStyle(color: Colors.white, fontSize: 36, fontWeight: FontWeight.w900, letterSpacing: 2)),
                      Text('Tap to send', style: TextStyle(color: Colors.white70, fontSize: 11.5, fontWeight: FontWeight.w600)),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          _offline
              ? 'No internet? Your SOS is saved on the phone and sent the moment you get signal.'
              : 'Your location, vehicle and problem are sent to nearby garages that have the right tools.',
          textAlign: TextAlign.center,
          style: AppText.muted.copyWith(fontSize: 12.5),
        ),
      ],
    );
  }

  /// Finding capable garages... / Waiting for a garage to accept /
  /// Help is on the way! + matched garages + auto-reassign timer + Cancel SOS
  Widget _active() {
    final searching = _state == _SosState.searching;
    const matched = [
      ('Fixora Garage', '2.1 km · ETA 12 min'),
      ('Peradeniya Motors', '3.4 km · ETA 18 min'),
      ('Kandy Auto Care', '4.0 km · ETA 22 min'),
    ];
    return Column(
      key: const ValueKey('active'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            gradient: _accepted >= 0 ? AppColors.successGradient : AppColors.sosGradient,
            borderRadius: BorderRadius.circular(18),
          ),
          child: Row(
            children: [
              SizedBox(
                width: 46,
                height: 46,
                child: _accepted >= 0
                    ? const Icon(Icons.check_circle_rounded, color: Colors.white, size: 42)
                    : const CircularProgressIndicator(color: Colors.white, strokeWidth: 3),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _accepted >= 0
                          ? 'Help is on the way!'
                          : _offline
                              ? 'SOS saved · retrying...'
                              : searching
                                  ? 'Finding capable garages...'
                                  : 'Waiting for a garage to accept',
                      style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      _accepted >= 0
                          ? '${matched[0].$1} accepted · arriving soon'
                          : '${_problems[_problem].$2} · Peradeniya Rd, Kandy',
                      style: TextStyle(color: Colors.white.o(0.88), fontSize: 12.5),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        if (_offline)
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppColors.surfaceSolid,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.border),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(Icons.bluetooth_searching_rounded, color: AppColors.link),
                    const SizedBox(width: 8),
                    Expanded(child: Text('Bluetooth relay (best-effort)', style: AppText.h3)),
                    SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.primary.o(0.8)),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  'Looking for nearby phones with Fixora that have internet to pass your SOS on. '
                  'We also retry by SMS every 30 seconds.',
                  style: AppText.muted.copyWith(fontSize: 12.5),
                ),
                const SizedBox(height: 10),
                OutlinedButton.icon(
                  onPressed: () {
                    setState(() => _offline = false);
                    _send();
                  },
                  icon: const Icon(Icons.wifi_rounded),
                  label: const Text('I am back online - send now'),
                ),
              ],
            ),
          )
        else ...[
          Row(
            children: [
              Expanded(child: Text('Matched garages', style: AppText.h3)),
              if (_accepted < 0)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppColors.warning.o(0.12),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.timer_outlined, size: 14, color: AppColors.warning),
                      const SizedBox(width: 4),
                      Text(
                        'Auto-reassign in $_countdown',
                        style: TextStyle(color: AppColors.warningText, fontWeight: FontWeight.w700, fontSize: 11),
                      ),
                    ],
                  ),
                ),
            ],
          ),
          const SizedBox(height: 10),
          if (searching)
            for (var i = 0; i < 2; i++)
              Container(
                height: 76,
                margin: const EdgeInsets.only(bottom: 10),
                decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(18)),
                child: const Center(child: LinearProgressIndicator(minHeight: 2)),
              )
          else
            for (var i = 0; i < matched.length; i++)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: _accepted == i ? AppColors.successSoft : AppColors.surface,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: _accepted == i ? AppColors.success : AppColors.border),
                  ),
                  child: Row(
                    children: [
                      Icon(
                        Icons.garage_outlined,
                        color: _accepted == i ? AppColors.success : AppColors.link,
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(matched[i].$1, style: AppText.label),
                            Text(
                              _accepted == i ? 'Accepted · arriving soon' : matched[i].$2,
                              style: AppText.small,
                            ),
                          ],
                        ),
                      ),
                      if (_accepted == i)
                        Icon(Icons.check_circle_rounded, color: AppColors.success),
                    ],
                  ),
                ),
              ),
        ],
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppColors.warningSoft,
            borderRadius: BorderRadius.circular(14),
          ),
          child: Row(
            children: [
              const Icon(Icons.alarm_rounded, color: AppColors.warning),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'We will remind you in 5 hours to call emergency services if you are still stuck.',
                  style: AppText.small.copyWith(fontSize: 11.5),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        OutlinedButton.icon(
          onPressed: _cancel,
          icon: Icon(_accepted >= 0 ? Icons.check_rounded : Icons.close_rounded),
          label: Text(_accepted >= 0 ? 'Done' : 'Cancel SOS'),
          style: OutlinedButton.styleFrom(
            foregroundColor: _accepted >= 0 ? AppColors.primary : AppColors.danger,
            minimumSize: const Size.fromHeight(48),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          ),
        ),
      ],
    );
  }
}
