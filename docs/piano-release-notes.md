# Generated piano fingering improvements

Generated piano fingerings now consider the complete hand: chords, simultaneous
voices, held keys and ties share one plan. Hiding a staff no longer removes its
physical constraints. Impossible or unsupported hands receive no invented partial
suggestions; independent playable hands can still receive fingerings.

Long scale passages receive smoother thumb-passage planning. Existing authored
edition digits and the legacy melody-fingering route retain their established
behavior. Experimental ergonomics and gesture models remain disabled.

On the documented, comparable reference set, agreement improves from 43.56% to
51.95% with no family losing matches against the released planner. One physically
conflicting case is explicitly withheld. These are editorial/completed-reference
results, not a claim that every suggested fingering is optimal for every pianist.

See [the release review](piano-release-review.md) for the direct-main comparison,
known limitations, changed regression ownership and verification evidence.
