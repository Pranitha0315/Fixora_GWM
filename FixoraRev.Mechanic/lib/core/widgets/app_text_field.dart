import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/app_colors.dart';

/// Input used on the auth screens: icon | divider | text, with a red
/// filled state + message underneath when [errorText] is set.
class AppTextField extends StatefulWidget {
  const AppTextField({
    super.key,
    required this.controller,
    required this.hint,
    required this.icon,
    this.errorText,
    this.isPassword = false,
    this.keyboardType,
    this.textInputAction = TextInputAction.next,
    this.onChanged,
    this.onSubmitted,
    this.prefix,
    this.inputFormatters,
    this.textCapitalization = TextCapitalization.none,
    this.enabled = true,
    this.autofocus = false,
    this.italicHint = false,
  });

  final TextEditingController controller;
  final String hint;
  final IconData icon;
  final String? errorText;
  final bool isPassword;
  final TextInputType? keyboardType;
  final TextInputAction textInputAction;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final Widget? prefix;
  final List<TextInputFormatter>? inputFormatters;
  final TextCapitalization textCapitalization;
  final bool enabled;
  final bool autofocus;
  final bool italicHint;

  @override
  State<AppTextField> createState() => _AppTextFieldState();
}

class _AppTextFieldState extends State<AppTextField> {
  late bool _obscure = widget.isPassword;
  final FocusNode _focus = FocusNode();

  @override
  void initState() {
    super.initState();
    _focus.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final hasError = widget.errorText != null;
    final focused = _focus.hasFocus;
    final borderColor = hasError
        ? AppColors.danger
        : focused
            ? AppColors.primary
            : AppColors.border;
    final iconColor = hasError
        ? AppColors.danger
        : focused
            ? AppColors.primary
            : AppColors.inkSoft;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          height: 54,
          padding: const EdgeInsets.symmetric(horizontal: 14),
          decoration: BoxDecoration(
            color: hasError ? AppColors.dangerSoft : AppColors.surface,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: borderColor, width: focused ? 1.5 : 1.1),
            boxShadow: focused && !hasError
                ? [
                    BoxShadow(
                      color: AppColors.primary.withValues(alpha: 0.12),
                      blurRadius: 10,
                      offset: const Offset(0, 3),
                    ),
                  ]
                : null,
          ),
          child: Row(
            children: [
              Icon(widget.icon, size: 21, color: iconColor),
              Container(
                width: 1.2,
                height: 22,
                margin: const EdgeInsets.symmetric(horizontal: 12),
                color: AppColors.border,
              ),
              if (widget.prefix != null) widget.prefix!,
              Expanded(
                child: TextField(
                  controller: widget.controller,
                  focusNode: _focus,
                  enabled: widget.enabled,
                  autofocus: widget.autofocus,
                  obscureText: _obscure,
                  keyboardType: widget.keyboardType,
                  textInputAction: widget.textInputAction,
                  textCapitalization: widget.textCapitalization,
                  inputFormatters: widget.inputFormatters,
                  onChanged: widget.onChanged,
                  onSubmitted: widget.onSubmitted,
                  style: TextStyle(
                    fontSize: 15,
                    color: AppColors.ink,
                    fontWeight: FontWeight.w500,
                  ),
                  // Outer pill already draws the border — kill theme borders
                  // so the hint does not show a second inner box.
                  decoration: InputDecoration(
                    isDense: true,
                    border: InputBorder.none,
                    enabledBorder: InputBorder.none,
                    focusedBorder: InputBorder.none,
                    disabledBorder: InputBorder.none,
                    errorBorder: InputBorder.none,
                    focusedErrorBorder: InputBorder.none,
                    filled: false,
                    contentPadding: EdgeInsets.zero,
                    hintText: widget.hint,
                    hintStyle: TextStyle(
                      color: AppColors.muted,
                      fontSize: 15,
                      fontStyle: widget.italicHint
                          ? FontStyle.italic
                          : FontStyle.normal,
                    ),
                  ),
                ),
              ),
              if (widget.isPassword)
                Semantics(
                  button: true,
                  label: _obscure ? 'Show password' : 'Hide password',
                  child: InkResponse(
                  onTap: () => setState(() => _obscure = !_obscure),
                  radius: 24,
                  // 44 x 44 hit area around the small eye icon (thumb-friendly).
                  child: SizedBox(
                    width: 44,
                    height: 44,
                    child: Icon(
                      _obscure
                          ? Icons.visibility_outlined
                          : Icons.visibility_off_outlined,
                      size: 21,
                      color: hasError ? AppColors.danger : AppColors.inkSoft,
                    ),
                  ),
                ),
                ),
            ],
          ),
        ),
        AnimatedSize(
          duration: const Duration(milliseconds: 180),
          child: hasError
              ? Padding(
                  padding: const EdgeInsets.only(top: 6, left: 4),
                  child: Row(
                    children: [
                      Icon(Icons.error_rounded,
                          size: 15, color: AppColors.danger),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          widget.errorText!,
                          style: TextStyle(
                            color: AppColors.danger,
                            fontSize: 12.5,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),
                    ],
                  ),
                )
              : const SizedBox(width: double.infinity),
        ),
      ],
    );
  }
}

/// Live checklist of password rules (8 chars, A-Z, 0-9, symbol).
class PasswordRules extends StatelessWidget {
  const PasswordRules({super.key, required this.password});
  final String password;

  @override
  Widget build(BuildContext context) {
    final rules = <String, bool>{
      'At least 8 characters': password.length >= 8,
      'One uppercase letter (A-Z)': RegExp(r'[A-Z]').hasMatch(password),
      'One number (0-9)': RegExp(r'[0-9]').hasMatch(password),
      'One special character (@#\$%)':
          RegExp(r'[^A-Za-z0-9\s]').hasMatch(password),
    };
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: rules.entries
          .map(
            (e) => Padding(
              padding: const EdgeInsets.symmetric(vertical: 3),
              child: Row(
                children: [
                  AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    width: 18,
                    height: 18,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: e.value
                          ? AppColors.success
                          : password.isEmpty
                              ? AppColors.border
                              : AppColors.danger,
                    ),
                    child: Icon(
                      e.value ? Icons.check_rounded : Icons.close_rounded,
                      size: 13,
                      color: AppColors.onPrimary,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Text(
                    e.key,
                    style: TextStyle(
                      fontSize: 13,
                      color: e.value ? AppColors.ink : AppColors.inkSoft,
                    ),
                  ),
                ],
              ),
            ),
          )
          .toList(),
    );
  }
}
