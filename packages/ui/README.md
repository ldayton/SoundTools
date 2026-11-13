# SoundTools UI

Shared React/Mantine foundation. Apps import standard controls directly from
`@mantine/core`. Share application/domain components only when there is actual
reuse; do not wrap or rename every Mantine control.

The provider changes only the primary brand color. Keep Mantine's default sizes,
spacing, typography, focus, and interaction behavior. Use a single provider at the application root.

Component CSS is imported without Mantine's document/body reset so the existing
exercise pages retain their layout. The migrated root uses Mantine's typography.
When the legacy exercise pages are migrated, replace these partial imports with Mantine's
normal stylesheet and remove the transitional root/reset boundary.

Note by Note includes this package's sources in its release fingerprint. Keep
that property when adding consumers so shared UI changes invalidate offline builds.
