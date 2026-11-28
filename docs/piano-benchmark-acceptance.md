# Permissive piano benchmark acceptance criteria

1. Import only pinned MIT/public-domain transcription data, complete licenses,
   attribution and per-file hashes. Do not execute upstream code or import PIG.
2. Preserve printed, inferred and doubtful labels separately. Only printed,
   unflagged editorial digits count toward the primary agreement metric.
3. Normalize notes, rests, voices, chords, ties and hand ownership without
   changing the music or supplying reference fingers to unconstrained inference.
4. Declare development and reserved validation partitions before baseline
   measurement. Publish per-family coverage, abstentions, agreement on supported
   notes and agreement over all eligible labels. Unsupported cases cannot improve
   agreement by disappearing. Matching an edition is not a correctness oracle.
5. Retain the pre-change baseline. Improve shared concerns only when development
   failures reveal a general issue. Preserve legacy/editorial contracts and test
   every behavior change independently; do not tune against reserved results.
6. Test importer/scoring behavior with independently specified synthetic examples,
   provenance integrity, representation invariance and mutation witnesses. Run
   the corpus reproducibly without executing external programs. Expensive corpus
   coverage belongs to Nightly, bounded contract coverage to CI.
7. Finish with an exact committed-HEAD local CI run and a reproducible report
   documenting remaining limitations. Do not claim expert approval or publication.
