// ============================================
// SEEDED PSEUDO-RANDOM NUMBER GENERATOR
// Mulberry32: Fast, simple, seedable 32-bit PRNG
// ============================================
class SeededRNG {
    constructor(seed) {
        this.state = seed >>> 0; // Ensure unsigned 32-bit
    }

    // Returns float in [0, 1)
    next() {
        let t = (this.state += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    // Get current state for reproducibility logging
    getState() {
        return this.state;
    }
}
