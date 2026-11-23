import 'package:flutter/material.dart';

import '../../core/backend/api_client.dart';
import '../../core/navigation/nav.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../data/models/models.dart';
import '../../data/models/vehicle.dart';
import '../../data/remote/customer_backend.dart';
import '../../data/repositories/app_state.dart';
import '../vehicles/add_vehicle_screen.dart';
import 'booking_dialogs.dart';
import 'live_queue_screen.dart';

/// Book a service: vehicle -> service -> symptoms -> vehicle-aware slot.
class BookServiceScreen extends StatefulWidget {
  final String? vehicleId;
  final String? service;
  final List<String> symptoms;
  final String? note;
  final ServiceOffer? offer;
  final DateTime? preferredDate;
  final String? garage;

  const BookServiceScreen({
    super.key,
    this.vehicleId,
    this.service,
    this.symptoms = const [],
    this.note,
    this.offer,
    this.preferredDate,
    this.garage,
  });

  @override
  State<BookServiceScreen> createState() => _BookServiceScreenState();
}

class _BookServiceScreenState extends State<BookServiceScreen> {
  static const _services = [
    (Icons.oil_barrel_outlined, 'General Service', '1.5 h', 'LKR 15k - 20k'),
    (Icons.troubleshoot_rounded, 'Diagnosis', '1 h', 'LKR 3,500'),
    (Icons.album_outlined, 'Brakes', '1.5 h', 'LKR 8k - 25k'),
    (Icons.ac_unit_rounded, 'AC Repair', '2 h', 'LKR 10k - 30k'),
    (Icons.electrical_services_rounded, 'Electrical', '1.5 h', 'LKR 5k - 20k'),
    (Icons.tire_repair_rounded, 'Tyres & Alignment', '1 h', 'LKR 6,500'),
    (Icons.format_paint_outlined, 'Body & Paint', '1 - 3 days', 'Quote'),
    (Icons.battery_charging_full_rounded, 'Hybrid Check', '1.5 h', 'LKR 9,500'),
  ];

  static const _baseSymptoms = [
    "Won't start",
    'Vibration',
    'Strange noise',
    'Overheating',
    'Warning light',
    'Brake issue',
    'Pulls to one side',
    'Smoke',
    'AC not cooling',
    'Battery drains',
  ];

  // Slot availability depends on bay + skilled mechanic + equipment.
  static const _slots = [
    ('08:30 AM', 2),
    ('09:30 AM', 0),
    ('10:30 AM', 1),
    ('11:30 AM', 3),
    ('01:30 PM', 0),
    ('02:30 PM', 2),
    ('03:30 PM', 1),
    ('04:30 PM', 3),
  ];

  late String _vehicleId;
  late int _service;
  late final Set<String> _picked = {...widget.symptoms};
  late final List<String> _symptoms = [
    ..._baseSymptoms,
    for (final s in widget.symptoms)
      if (!_baseSymptoms.contains(s)) s,
  ];
  late DateTime _date;
  int? _slot;
  late final _note = TextEditingController(text: widget.note ?? '');
  bool _loading = false;
  late final String _garage = widget.garage ?? 'Fixora Colombo';

  @override
  void initState() {
    super.initState();
    final app = AppState.instance;
    final active = app.activeVehicles;
    final wanted = widget.vehicleId;
    _vehicleId = (wanted != null && active.any((v) => v.id == wanted))
        ? wanted
        : (active.isNotEmpty ? active.first.id : app.selectedVehicle.id);
    final idx = _services.indexWhere((s) => s.$2 == widget.service);
    _service = idx >= 0 ? idx : 0;
    final preferred = widget.preferredDate;
    if (preferred != null) {
      var d = DateTime(preferred.year, preferred.month, preferred.day);
      if (d.weekday == DateTime.sunday) d = d.add(const Duration(days: 1));
      _date = d.isBefore(_firstDate) ? _firstDate : d;
    } else {
      final today = DateTime.now();
      var d = DateTime(today.year, today.month, today.day).add(const Duration(days: 1));
      if (d.weekday == DateTime.sunday) d = d.add(const Duration(days: 1));
      _date = d;
    }
  }

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  DateTime get _firstDate {
    final n = DateTime.now();
    return DateTime(n.year, n.month, n.day);
  }

  DateTime get _lastDate => _firstDate.add(const Duration(days: 180));

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date.isBefore(_firstDate) ? _firstDate : _date,
      firstDate: _firstDate,
      lastDate: _lastDate,
      helpText: 'Select service date',
      selectableDayPredicate: (d) => d.weekday != DateTime.sunday,
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: Theme.of(ctx).colorScheme.copyWith(
                primary: AppColors.primary,
                onPrimary: Colors.white,
              ),
        ),
        child: child!,
      ),
    );
    if (picked != null && mounted) {
      setState(() {
        _date = picked;
        _slot = null;
      });
    }
  }

  DateTime _slotTime(DateTime d, int slot) {
    final parts = _slots[slot].$1.split(RegExp(r'[: ]'));
    var h = int.parse(parts[0]);
    final m = int.parse(parts[1]);
    if (parts[2] == 'PM' && h != 12) h += 12;
    if (parts[2] == 'AM' && h == 12) h = 0;
    return DateTime(d.year, d.month, d.day, h, m);
  }

  void _snack(String msg, {IconData icon = Icons.info_outline_rounded}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            Icon(icon, color: Colors.white, size: 18),
            const SizedBox(width: 10),
            Expanded(child: Text(msg)),
          ],
        ),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  void _chooseVehicle(List<Vehicle> vehicles) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.sheet,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Choose vehicle (${vehicles.length})', style: AppText.h1),
            const SizedBox(height: 12),
            for (final v in vehicles)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _VehicleOption(
                  vehicle: v,
                  selected: v.id == _vehicleId,
                  onTap: () {
                    setState(() => _vehicleId = v.id);
                    Navigator.of(ctx).pop();
                  },
                ),
              ),
            OutlinedButton.icon(
              onPressed: () async {
                Navigator.of(ctx).pop();
                await context.push(const AddVehicleScreen());
                if (mounted) setState(() {});
              },
              icon: const Icon(Icons.add_rounded),
              label: const Text('Add New Vehicle'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _confirm() async {
    if (_slot == null) {
      // Pick a time slot
      _snack('Pick a time slot', icon: Icons.error_outline_rounded);
      return;
    }
    setState(() => _loading = true);
    final d = _slotTime(_date, _slot!);
    String? remoteId;

    if (CustomerBackend.instance.live &&
        !AppState.instance.vehicles.any((v) => v.id == _vehicleId)) {
      setState(() => _loading = false);
      _snack('Add your vehicle first, then book.', icon: Icons.directions_car_outlined);
      await context.push(const AddVehicleScreen());
      if (!mounted) return;
      final active = AppState.instance.activeVehicles;
      if (active.isNotEmpty) setState(() => _vehicleId = active.first.id);
      return;
    }

    // live → CustomerBackend.instance.book(...)
    if (CustomerBackend.instance.live) {
      try {
        final b = await CustomerBackend.instance.book(
          vehicleId: _vehicleId,
          serviceName: _services[_service].$2,
          slotStart: d,
          notes: _picked.isEmpty ? null : _picked.join(', '),
        );
        remoteId = b['id'] as String?;
      } on ApiException catch (e) {
        if (!mounted) return;
        setState(() => _loading = false);
        // 409 conflict → "That slot was just taken"
        _snack(
          e.isConflict ? 'That slot was just taken. Pick another time.' : e.message,
          icon: Icons.error_outline_rounded,
        );
        return;
      }
    } else if (CustomerBackend.instance.enabled) {
      setState(() => _loading = false);
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          icon: const Icon(Icons.cloud_off_rounded),
          title: const Text('Not connected to the garage'),
          content: const Text(
            'You are using demo data, so this booking cannot reach the garage manager. '
            'Log out and log in with your garage account while the garage server is running.',
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('OK')),
          ],
        ),
      );
      return;
    } else {
      await Future<void>.delayed(const Duration(milliseconds: 800));
    }

    if (!mounted) return;
    final booking = AppState.instance.addBooking(
      id: remoteId,
      vehicleId: _vehicleId,
      service: _services[_service].$2,
      date: d,
      symptoms: _picked.toList(),
      offer: widget.offer == null ? null : '${widget.offer!.percent}% OFF - ${widget.offer!.title}',
      garage: _garage,
    );
    setState(() => _loading = false);

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    final goQueue = await showSuccessDialog<bool>(
      context,
      title: remoteId == null ? 'Booking Confirmed!' : 'Booking requested',
      message:
          '${_services[_service].$2} at $_garage on ${weekdays[d.weekday - 1]}, ${d.day} ${months[d.month - 1]} '
          'at ${_slots[_slot!].$1}. Booking ID ${booking.id}.',
      actions: (dc) => [
        Expanded(
          child: OutlinedButton(
            onPressed: () => Navigator.of(dc).pop(false),
            style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
            child: const Text('My Bookings'),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: FilledButton(
            onPressed: () => Navigator.of(dc).pop(true),
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.primary,
              minimumSize: const Size.fromHeight(48),
            ),
            child: const Text('Live Queue'),
          ),
        ),
      ],
    );
    if (!mounted) return;
    if (goQueue == true) {
      context.pushReplacement(LiveQueueScreen(bookingId: booking.id));
    } else {
      Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final app = AppState.instance;
    final vehicles = app.activeVehicles;
    final vehicle = app.vehicleById(_vehicleId);
    final service = _services[_service];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        title: const Text('Book a Service'),
        backgroundColor: AppColors.bg,
        foregroundColor: AppColors.navy,
        elevation: 0,
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
        children: [
          Text(
            'Only slots the garage can really handle for your car are shown.',
            style: AppText.muted,
          ),
          _StepLabel(
            1,
            'Choose vehicle',
            action: vehicles.length > 1 ? 'View All (${vehicles.length})' : null,
            onAction: () => _chooseVehicle(vehicles),
          ),
          if (vehicles.isEmpty)
            OutlinedButton.icon(
              onPressed: () async {
                await context.push(const AddVehicleScreen());
                if (mounted) setState(() {});
              },
              icon: const Icon(Icons.add_rounded),
              label: const Text('Add a vehicle to book'),
            )
          else
            _VehicleOption(
              vehicle: vehicle,
              selected: true,
              trailing: TextButton(
                onPressed: () => _chooseVehicle(vehicles),
                child: const Text('Change', style: TextStyle(fontWeight: FontWeight.w700)),
              ),
              onTap: () => _chooseVehicle(vehicles),
            ),
          const _StepLabel(2, 'Service type'),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: _services.length,
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 4,
              mainAxisSpacing: 8,
              crossAxisSpacing: 8,
              childAspectRatio: 0.82,
            ),
            itemBuilder: (_, i) {
              final s = _services[i];
              final sel = i == _service;
              return GestureDetector(
                onTap: () => setState(() => _service = i),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 220),
                  padding: const EdgeInsets.all(6),
                  decoration: BoxDecoration(
                    gradient: sel ? AppColors.primaryGradient : null,
                    color: sel ? null : AppColors.surface,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: sel ? Colors.transparent : AppColors.border),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(s.$1, color: sel ? Colors.white : AppColors.primary, size: 26),
                      const SizedBox(height: 6),
                      Text(
                        s.$2,
                        textAlign: TextAlign.center,
                        maxLines: 2,
                        style: TextStyle(
                          fontSize: 11,
                          height: 1.15,
                          fontWeight: FontWeight.w700,
                          color: sel ? Colors.white : AppColors.navy,
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
          const _StepLabel(3, 'What is happening? (symptoms)'),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final s in _symptoms)
                GestureDetector(
                  onTap: () => setState(() => _picked.contains(s) ? _picked.remove(s) : _picked.add(s)),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: _picked.contains(s) ? AppColors.primary : AppColors.surface,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: _picked.contains(s) ? AppColors.primary : AppColors.border),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (_picked.contains(s)) ...[
                          const Icon(Icons.check_rounded, size: 15, color: Colors.white),
                          const SizedBox(width: 4),
                        ],
                        Text(
                          s,
                          style: TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w600,
                            color: _picked.contains(s) ? Colors.white : AppColors.navy,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _note,
            maxLines: 2,
            decoration: InputDecoration(
              hintText: 'Describe it in your words (when, how often, any sound?)',
              filled: true,
              fillColor: AppColors.fieldFill,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
            ),
          ),
          const _StepLabel(4, 'Pick a date & time'),
          Material(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(16),
            child: InkWell(
              borderRadius: BorderRadius.circular(16),
              onTap: _pickDate,
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Row(
                  children: [
                    Container(
                      width: 58,
                      height: 62,
                      decoration: BoxDecoration(
                        gradient: AppColors.primaryGradient,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(
                            months[_date.month - 1].toUpperCase(),
                            style: const TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.w700),
                          ),
                          Text(
                            '${_date.day}',
                            style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w800, height: 1.1),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Service date', style: AppText.small.copyWith(fontSize: 12)),
                          Text(
                            '${weekdays[_date.weekday - 1]}, ${_date.day} ${months[_date.month - 1]} ${_date.year}',
                            style: AppText.h3.copyWith(fontSize: 16),
                          ),
                          Text(
                            'Tap to open calendar · Sundays closed',
                            style: AppText.small.copyWith(fontSize: 11, color: AppColors.link),
                          ),
                        ],
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.all(9),
                      decoration: BoxDecoration(color: AppColors.primarySoft, borderRadius: BorderRadius.circular(12)),
                      child: Icon(Icons.calendar_month_rounded, color: AppColors.link),
                    ),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Icon(Icons.schedule_rounded, size: 18, color: AppColors.navy),
              const SizedBox(width: 6),
              Text('Available time slots', style: AppText.label.copyWith(fontSize: 14)),
            ],
          ),
          const SizedBox(height: 12),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: _slots.length,
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 4,
              mainAxisSpacing: 8,
              crossAxisSpacing: 8,
              childAspectRatio: 1.45,
            ),
            itemBuilder: (_, i) {
              final left = (_slots[i].$2 + _date.day) % 4;
              final full = left == 0 || _slotTime(_date, i).isBefore(DateTime.now());
              final sel = _slot == i;
              return GestureDetector(
                onTap: full ? null : () => setState(() => _slot = i),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  decoration: BoxDecoration(
                    gradient: sel ? AppColors.primaryGradient : null,
                    color: sel ? null : (full ? AppColors.adapt(const Color(0xFFF0F6F5)) : AppColors.surface),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: sel ? Colors.transparent : AppColors.border),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        _slots[i].$1,
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          decoration: full ? TextDecoration.lineThrough : null,
                          color: sel ? Colors.white : (full ? AppColors.textFaint : AppColors.navy),
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        full
                            ? 'Bay full'
                            : left == 1
                                ? '1 left'
                                : '$left left',
                        style: TextStyle(
                          fontSize: 9.5,
                          fontWeight: FontWeight.w600,
                          color: sel
                              ? Colors.white70
                              : full
                                  ? AppColors.textFaint
                                  : left == 1
                                      ? AppColors.warningText
                                      : AppColors.successText,
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(16)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Booking Summary', style: AppText.h3),
                const SizedBox(height: 8),
                _kv('Vehicle', '${vehicle.name} · ${vehicle.plate}'),
                _kv('Service', service.$2),
                _kv('Expected duration', service.$3),
                _kv('Garage', _garage),
                _kv('Estimated cost', service.$4),
                if (widget.offer != null && widget.offer!.service == service.$2)
                  _kv('Offer (${widget.offer!.percent}% OFF)', widget.offer!.title),
                if (_picked.isNotEmpty) _kv('Symptoms', '${_picked.length} selected'),
              ],
            ),
          ),
          const SizedBox(height: 16),
          SizedBox(
            height: 54,
            child: FilledButton.icon(
              onPressed: _loading ? null : _confirm,
              icon: _loading
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : const Icon(Icons.event_available_rounded),
              label: Text(_loading ? 'Confirming…' : 'Confirm Booking'),
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.primary,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _kv(String k, String v) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Row(
          children: [
            Expanded(child: Text(k, style: AppText.muted)),
            Flexible(child: Text(v, textAlign: TextAlign.end, style: AppText.label)),
          ],
        ),
      );
}

class _StepLabel extends StatelessWidget {
  final int n;
  final String text;
  final String? action;
  final VoidCallback? onAction;
  const _StepLabel(this.n, this.text, {this.action, this.onAction});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 18, bottom: 10),
      child: Row(
        children: [
          Container(
            width: 24,
            height: 24,
            alignment: Alignment.center,
            decoration: const BoxDecoration(gradient: AppColors.primaryGradient, shape: BoxShape.circle),
            child: Text('$n', style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w800)),
          ),
          const SizedBox(width: 10),
          Expanded(child: Text(text, style: AppText.h3)),
          if (action != null)
            GestureDetector(
              onTap: onAction,
              child: Row(
                children: [
                  Text(action!, style: TextStyle(color: AppColors.link, fontSize: 13, fontWeight: FontWeight.w700)),
                  Icon(Icons.chevron_right_rounded, size: 18, color: AppColors.link),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _VehicleOption extends StatelessWidget {
  final Vehicle vehicle;
  final bool selected;
  final VoidCallback onTap;
  final Widget? trailing;
  const _VehicleOption({
    required this.vehicle,
    required this.selected,
    required this.onTap,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    final v = vehicle;
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 220),
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: selected ? AppColors.primarySoft : AppColors.surface,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: selected ? AppColors.primary : AppColors.border, width: selected ? 1.6 : 1),
        ),
        child: Row(
          children: [
            CircleAvatar(
              radius: 28,
              backgroundColor: AppColors.surfaceSolid,
              child: Icon(v.type.icon, color: AppColors.link),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(v.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.h3.copyWith(fontSize: 15)),
                  Text(v.plate, style: AppText.small.copyWith(fontSize: 12, color: AppColors.text)),
                  Text('${v.fuel} · ${v.year} · ${v.type.label}', style: AppText.small.copyWith(fontSize: 11)),
                ],
              ),
            ),
            if (trailing != null)
              trailing!
            else if (selected)
              Icon(Icons.check_circle_rounded, color: AppColors.link),
          ],
        ),
      ),
    );
  }
}
