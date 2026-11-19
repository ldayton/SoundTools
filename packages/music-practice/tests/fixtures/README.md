The `sha256` fields are the original approved JSON fingerprints and remain
unchanged. `portableSha256` fingerprints the same approved data with fractional
numbers rounded to nine decimal places. This removes OS/CPU math-library noise
well below audio-sample timing or gain resolution; pitches, event order and
musically meaningful timing/level changes remain covered.

The Linux CI probe found 25 gain values differing from the Mac by exactly
`1.1102230246251565e-16`, with no note, event-order or structural differences.
Both representations produce the same portable fingerprint.

`normalize-backing-baselines.ts` adds portable fingerprints only after confirming
each take matches its original approved hash byte-for-byte. It deliberately
refuses to regenerate on a platform with different final floating-point bits,
or after a musical change. It does not replace the approved musical baseline.
