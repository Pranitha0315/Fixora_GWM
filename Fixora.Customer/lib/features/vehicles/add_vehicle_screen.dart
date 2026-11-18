import 'package:flutter/material.dart';

import '../../core/backend/api_client.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../data/models/vehicle.dart';
import '../../data/remote/customer_backend.dart';
import '../../data/repositories/app_state.dart';

/// Add New Vehicle / Edit Vehicle form.
class AddVehicleScreen extends StatefulWidget {
  /// Pass an id to edit an existing vehicle.
  /// null = add, set = edit
  final String? editId;
  const AddVehicleScreen({super.key, this.editId});

  @override
  State<AddVehicleScreen> createState() => _AddVehicleScreenState();
}

class _AddVehicleScreenState extends State<AddVehicleScreen> {
  static const _brands = <VehicleType, List<String>>{
    VehicleType.fourWheeler: ['Toyota', 'Honda', 'Suzuki', 'Nissan', 'BMW', 'Other'],
    VehicleType.twoWheeler: ['Honda', 'Yamaha', 'Bajaj', 'TVS', 'Other'],
    VehicleType.threeWheeler: ['Bajaj', 'Piaggio', 'Other'],
  };
  static const _fuels = ['Petrol', 'Diesel', 'Hybrid', 'Electric'];
  static const _colors = ['White', 'Black', 'Silver', 'Red', 'Blue', 'Other'];

  final _model = TextEditingController();
  final _plate = TextEditingController();
  final _mileage = TextEditingController();

  VehicleType _type = VehicleType.fourWheeler;
  String? _brand;
  int? _year;
  String? _fuel;
  String? _color;
  bool _active = true;
  bool _saving = false;
  bool _submitted = false;

  bool get _editingMode => widget.editId != null;

  Vehicle? get _editing =>
      widget.editId == null ? null : AppState.instance.vehicleById(widget.editId!);

  @override
  void initState() {
    super.initState();
    final v = _editing;
    if (v != null && widget.editId != null) {
      _type = v.type;
      final brands = _brands[v.type] ?? const [];
      _brand = brands.contains(v.make) ? v.make : 'Other';
      _model.text = v.model;
      _plate.text = v.plate;
      _mileage.text = '${v.mileageKm}';
      _year = v.year;
      _fuel = _fuels.contains(v.fuel) ? v.fuel : null;
      _color = _colors.contains(v.color) ? v.color : 'Other';
      _active = v.active;
    }
  }

  @override
  void dispose() {
    _model.dispose();
    _plate.dispose();
    _mileage.dispose();
    super.dispose();
  }

  List<int> get _years {
    final now = DateTime.now().year;
    return [for (var y = now; y >= 1990; y--) y];
  }

  String? get _brandError => _submitted && _brand == null ? 'Select a brand' : null;
  String? get _modelError => _submitted && _model.text.trim().isEmpty ? 'Enter the model' : null;
  String? get _yearError => _submitted && _year == null ? 'Select the year' : null;
  String? get _fuelError => _submitted && _fuel == null ? 'Select the fuel type' : null;

  String? get _plateError {
    if (!_submitted) return null;
    final p = _plate.text.trim();
    final compact = p.replaceAll(RegExp(r'[\s-]'), '');
    if (compact.isEmpty) return 'Enter the registration number';
    if (compact.length < 5 || !RegExp(r'^([A-Za-z]{1,6}[0-9]{3,4}|[0-9]{5,7})$').hasMatch(compact)) {
      return 'Use a format like WP CAB - 1234';
    }
    if (AppState.instance.plateExists(p, exceptId: widget.editId)) {
      return 'This vehicle is already in your list';
    }
    return null;
  }

  String _formatPlate(String raw) {
    final c = raw.replaceAll(RegExp(r'[\s-]'), '').toUpperCase();
    final m = RegExp(r'^([A-Z]{2})([A-Z]{1,3})([0-9]{3,4})$').firstMatch(c);
    if (m != null) return '${m.group(1)} ${m.group(2)} - ${m.group(3)}';
    final m2 = RegExp(r'^([A-Z]{1,3})([0-9]{3,4})$').firstMatch(c);
    if (m2 != null) return '${m2.group(1)} - ${m2.group(2)}';
    return raw.toUpperCase();
  }

  void _snack(String msg, {IconData icon = Icons.check_circle_outline_rounded}) {
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

  Future<void> _save() async {
    // field validation (brand, model, plate, year, fuel)
    setState(() => _submitted = true);
    if (_brandError != null ||
        _modelError != null ||
        _plateError != null ||
        _yearError != null ||
        _fuelError != null) {
      _snack('Please fill the highlighted fields', icon: Icons.error_outline_rounded);
      return;
    }

    setState(() => _saving = true);
    final app = AppState.instance;
    final mileage = int.tryParse(_mileage.text.replaceAll(',', '').trim()) ?? 0;
    final plate = _formatPlate(_plate.text.trim());

    // live → CustomerBackend.saveVehicle(...)
    String? serverId;
    if (CustomerBackend.instance.live) {
      try {
        final saved = await CustomerBackend.instance.saveVehicle(
          id: widget.editId,
          plate: plate,
          make: _brand!,
          model: _model.text.trim(),
          year: _year!,
          type: _type,
          mileageKm: mileage,
          color: _color,
          fuel: _fuel,
        );
        serverId = saved.id;
      } on ApiException catch (e) {
        if (!mounted) return;
        setState(() => _saving = false);
        _snack(e.message, icon: Icons.error_outline_rounded);
        return;
      }
    } else {
      await Future<void>.delayed(const Duration(milliseconds: 700));
    }
    if (!mounted) return;

    final old = _editingMode ? _editing : null;
    if (old != null) {
      // edit → app.updateVehicle(...)
      app.updateVehicle(old.copyWith(
        make: _brand,
        model: _model.text.trim(),
        plate: plate,
        year: _year,
        fuel: _fuel,
        color: _color ?? old.color,
        type: _type,
        active: _active,
        mileageKm: mileage,
      ));
      _snack('Vehicle updated');
    } else {
      // add → app.addVehicle(...)
      app.addVehicle(Vehicle(
        id: serverId ?? app.newVehicleId(),
        make: _brand!,
        model: _model.text.trim(),
        year: _year!,
        plate: plate,
        type: _type,
        active: _active,
        fuel: _fuel!,
        color: _color ?? 'Other',
        mileageKm: mileage,
      ));
      _snack('${_brand!} ${_model.text.trim()} added to My Vehicles');
    }

    setState(() => _saving = false);
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final editing = _editingMode;

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        title: Text(editing ? 'Edit Vehicle' : 'Add New Vehicle'),
        backgroundColor: AppColors.bg,
        foregroundColor: AppColors.navy,
        elevation: 0,
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
        children: [
          Text('Enter your vehicle details below', style: AppText.muted),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 18),
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _label('Vehicle Type'),
                Wrap(
                  spacing: 8,
                  children: [
                    for (final t in VehicleType.values)
                      ChoiceChip(
                        label: Text(t.tabLabel),
                        selected: _type == t,
                        onSelected: (_) => setState(() {
                          _type = t;
                          final next = _brands[_type] ?? const [];
                          if (_brand != null && !next.contains(_brand)) _brand = null;
                        }),
                      ),
                  ],
                ),
                const SizedBox(height: 12),
                _label('Brand', required: true),
                DropdownButtonFormField<String>(
                  // ignore: deprecated_member_use
                  value: _brand,
                  decoration: _decoration(errorText: _brandError, icon: Icons.verified_outlined),
                  hint: const Text('Select vehicle brand'),
                  items: [
                    for (final b in (_brands[_type] ?? const <String>[]))
                      DropdownMenuItem(value: b, child: Text(b)),
                  ],
                  onChanged: (v) => setState(() => _brand = v),
                ),
                const SizedBox(height: 12),
                _label('Model', required: true),
                TextField(
                  controller: _model,
                  textCapitalization: TextCapitalization.words,
                  decoration: _decoration(
                    hint: 'Enter vehicle model',
                    icon: Icons.drive_file_rename_outline_rounded,
                    errorText: _modelError,
                  ),
                  onChanged: (_) => setState(() {}),
                ),
                const SizedBox(height: 12),
                _label('Registration Number', required: true),
                TextField(
                  controller: _plate,
                  textCapitalization: TextCapitalization.characters,
                  decoration: _decoration(
                    hint: 'e.g. WP CAB - 1234',
                    icon: Icons.badge_outlined,
                    errorText: _plateError,
                  ),
                  onChanged: (_) => setState(() {}),
                ),
                const SizedBox(height: 12),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          _label('Year', required: true),
                          DropdownButtonFormField<int>(
                            // ignore: deprecated_member_use
                            value: _year,
                            decoration: _decoration(
                              errorText: _yearError,
                              icon: Icons.calendar_today_outlined,
                            ),
                            hint: const Text('Select year'),
                            items: [
                              for (final y in _years) DropdownMenuItem(value: y, child: Text('$y')),
                            ],
                            onChanged: (v) => setState(() => _year = v),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          _label('Fuel Type', required: true),
                          DropdownButtonFormField<String>(
                            // ignore: deprecated_member_use
                            value: _fuel,
                            decoration: _decoration(
                              errorText: _fuelError,
                              icon: Icons.local_gas_station_outlined,
                            ),
                            hint: const Text('Select fuel'),
                            items: [
                              for (final f in _fuels) DropdownMenuItem(value: f, child: Text(f)),
                            ],
                            onChanged: (v) => setState(() => _fuel = v),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          _label('Color'),
                          DropdownButtonFormField<String>(
                            // ignore: deprecated_member_use
                            value: _color,
                            decoration: _decoration(icon: Icons.palette_outlined),
                            hint: const Text('Select color'),
                            items: [
                              for (final c in _colors) DropdownMenuItem(value: c, child: Text(c)),
                            ],
                            onChanged: (v) => setState(() => _color = v),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          _label('Mileage (km)'),
                          TextField(
                            controller: _mileage,
                            keyboardType: TextInputType.number,
                            decoration: _decoration(
                              hint: 'e.g. 35000',
                              icon: Icons.speed_rounded,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                _label('Vehicle Status'),
                Row(
                  children: [
                    Expanded(
                      child: ChoiceChip(
                        label: const Text('Active'),
                        selected: _active,
                        onSelected: (_) => setState(() => _active = true),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: ChoiceChip(
                        label: const Text('Inactive'),
                        selected: !_active,
                        onSelected: (_) => setState(() => _active = false),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                SizedBox(
                  height: 54,
                  child: FilledButton.icon(
                    onPressed: _saving ? null : _save,
                    icon: _saving
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                          )
                        : const Icon(Icons.check_rounded),
                    label: Text(editing ? 'Save Changes' : 'Save Vehicle'),
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _label(String text, {bool required = false}) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text.rich(
          TextSpan(
            text: text,
            style: AppText.label,
            children: [
              if (required)
                TextSpan(text: ' *', style: AppText.label.copyWith(color: AppColors.danger)),
            ],
          ),
        ),
      );

  InputDecoration _decoration({String? hint, IconData? icon, String? errorText}) {
    return InputDecoration(
      hintText: hint,
      prefixIcon: icon == null ? null : Icon(icon),
      errorText: errorText,
      filled: true,
      fillColor: AppColors.fieldFill,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: AppColors.fieldBorder),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: AppColors.link, width: 1.4),
      ),
    );
  }
}
