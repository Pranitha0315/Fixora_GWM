/// Tiny dependency-free hash for the demo hash chain (two FNV-1a 32-bit
/// passes -> 16 hex chars). The real backend uses SHA-256, as in the BRD.
class HashChain {
  HashChain._();

  static const genesis = '0000000000000000';

  static String hash(String prevHash, String payload) {
    final input = '$prevHash|$payload';
    return _fnv(input, 0x811C9DC5) + _fnv(input, 0x01000193 ^ 0x5BD1E995);
  }

  static String _fnv(String input, int seed) {
    var h = seed & 0xFFFFFFFF;
    for (final unit in input.codeUnits) {
      h ^= unit;
      h = _mul32(h, 0x01000193);
    }
    return h.toRadixString(16).padLeft(8, '0');
  }

  // 32-bit multiply that stays exact on every platform (incl. web).
  static int _mul32(int a, int b) {
    final lo = a & 0xFFFF;
    final hi = (a >> 16) & 0xFFFF;
    return ((lo * b) + (((hi * b) & 0xFFFF) * 0x10000)) & 0xFFFFFFFF;
  }

  static String short(String hash) => '#${hash.substring(0, 8)}';
}
